#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Shared helpers for the standalone guard hooks in this folder.
#
# They speak the Claude Code PreToolUse protocol: the payload arrives as JSON
# on stdin, the decision leaves as JSON on stdout, always with exit code 0.
# Protocol reference: https://code.claude.com/docs/en/hooks
#
# Unlike lib/adapter.sh, nothing here depends on the rest of the repository:
# these helpers back the two self-contained guards (guard-env-file.sh,
# guard-project-scope.sh) rather than scripts/agent-security/policy.sh.
# ---------------------------------------------------------------------------
set -uo pipefail
set -f # no pathname expansion: tokens are data, never globs to expand

HK_PAYLOAD=""
HK_TOOL=""
HK_ROOT=""
HK_CWD=""

# --- output ----------------------------------------------------------------

hk__escape() { # minimal JSON string escaping
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/}"
  printf '%s' "$s"
}

# Deny the tool call and stop. Silence means "no opinion": emitting an explicit
# "allow" would auto-approve the call and bypass the user's own permission
# settings, so a guard must only ever tighten, never loosen.
hk_deny() { # <reason>
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
    "$(hk__escape "$1")"
  exit 0
}

# Block a UserPromptSubmit turn. That event has no permissionDecision: exit
# code 2 is what erases the prompt, and stderr is what the user reads. The
# prompt never reaches the model, so the reason is addressed to the owner.
hk_block_prompt() { # <reason>
  printf '%s\n' "$1" >&2
  exit 2
}

# --- payload parsing -------------------------------------------------------

hk__python() { # <mode: get|strings|paths>
  HK_MODE="$1" python3 -c '
import json, os, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

mode = os.environ.get("HK_MODE", "get")

if mode == "get":
    node = data
    for part in os.environ.get("HK_PATH", "").strip(".").split("."):
        if not part:
            break
        node = node.get(part) if isinstance(node, dict) else None
        if node is None:
            sys.exit(0)
    print(node if isinstance(node, str) else json.dumps(node))
    sys.exit(0)

rx = re.compile(os.environ.get("HK_KEYS", "."), re.I)
out = []

def walk(node, trail):
    if isinstance(node, dict):
        for key, value in node.items():
            walk(value, trail + [str(key)])
    elif isinstance(node, list):
        for index, value in enumerate(node):
            walk(value, trail + [str(index)])
    elif isinstance(node, str):
        if mode == "strings" or rx.search(".".join(trail)):
            out.append(node)

walk(data.get("tool_input") or {}, [])
print("\n".join(out))
' 2>/dev/null
}

hk_get() { # <jq path, e.g. .tool_input.command>
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HK_PAYLOAD" | jq -r "${1} // empty" 2>/dev/null
  else
    printf '%s' "$HK_PAYLOAD" | HK_PATH="$1" hk__python get
  fi
}

hk_get_any() { # <jq path>... - first non-empty
  local candidate value
  for candidate in "$@"; do
    value="$(hk_get "$candidate")"
    [ -n "$value" ] && {
      printf '%s' "$value"
      return 0
    }
  done
}

# Every string inside tool_input, one per line. Use only where a false positive
# on free-form text (a file body, a commit message) is harmless.
hk_tool_strings() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HK_PAYLOAD" | jq -r '[.tool_input // {} | .. | strings] | .[]' 2>/dev/null
  else
    printf '%s' "$HK_PAYLOAD" | hk__python strings
  fi
}

# Strings living under a key that looks like a path, one per line. This is what
# keeps a guard from tripping over a document that merely *mentions* ../ or the
# dotenv file.
HK_PATH_KEYS='path|file|dir|cwd|target|source|destination|notebook|command'

hk_tool_path_values() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HK_PAYLOAD" |
      jq -r --arg keys "$HK_PATH_KEYS" '
        [ .tool_input // {}
          | paths(scalars) as $p
          | select([$p[] | tostring] | join(".") | test($keys; "i"))
          | getpath($p)
          | strings
        ] | .[]' 2>/dev/null
  else
    printf '%s' "$HK_PAYLOAD" | HK_KEYS="$HK_PATH_KEYS" hk__python paths
  fi
}

# --- paths -----------------------------------------------------------------

hk_abs() { # <path> [base] - absolute and lexically normalised, no filesystem access
  local raw="$1" base="${2:-$HK_CWD}" out="" segment old_ifs
  case "$raw" in
    '~') raw="${HOME:-/}" ;;
    '~/'*) raw="${HOME:-/}/${raw#\~/}" ;;
  esac
  case "$raw" in
    /*) ;;
    *) raw="$base/$raw" ;;
  esac
  old_ifs="$IFS"
  IFS='/'
  for segment in $raw; do
    case "$segment" in
      '' | .) ;;
      ..) out="${out%/*}" ;;
      *) out="$out/$segment" ;;
    esac
  done
  IFS="$old_ifs"
  printf '%s' "${out:-/}"
}

hk_real() { # <absolute path> - follow symlinks when the tooling allows it
  local out=""
  command -v realpath >/dev/null 2>&1 && out="$(realpath -m -- "$1" 2>/dev/null)"
  [ -z "$out" ] && command -v readlink >/dev/null 2>&1 && out="$(readlink -f -- "$1" 2>/dev/null)"
  printf '%s' "${out:-$1}"
}

hk_inside() { # <absolute path> - 0 when it is the project root or below it
  [ "$1" = "$HK_ROOT" ] && return 0
  case "$1" in "$HK_ROOT"/*) return 0 ;; esac
  return 1
}

# --- bootstrap -------------------------------------------------------------

hk__parsable() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HK_PAYLOAD" | jq empty >/dev/null 2>&1
  else
    printf '%s' "$HK_PAYLOAD" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1
  fi
}

hk_init() {
  HK_PAYLOAD="$(cat)"

  # Fail closed: no parser, or a payload we cannot read, must never be mistaken
  # for "nothing to see here".
  if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    hk_deny "This guard hook needs jq or python3 to read the tool payload, and neither is on PATH, so the call cannot be validated. Install jq (apt-get install jq / brew install jq) and retry."
  fi

  if [ -n "$HK_PAYLOAD" ] && ! hk__parsable; then
    hk_deny "This guard hook could not parse the tool payload, so the call cannot be validated against the project guardrails. Retry with a simpler argument, or report the malformed payload to the owner."
  fi

  HK_TOOL="$(hk_get '.tool_name')"

  HK_ROOT="${CLAUDE_PROJECT_DIR:-}"
  [ -z "$HK_ROOT" ] && HK_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
  [ -z "$HK_ROOT" ] && HK_ROOT="$PWD"
  HK_ROOT="$(cd "$HK_ROOT" 2>/dev/null && pwd -P)" || HK_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
  HK_ROOT="${HK_ROOT%/}"

  HK_CWD="$(hk_get '.cwd')"
  [ -z "$HK_CWD" ] && HK_CWD="$HK_ROOT"
  HK_CWD="${HK_CWD%/}"
}
