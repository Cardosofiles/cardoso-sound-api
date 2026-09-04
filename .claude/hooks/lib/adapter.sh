#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Claude Code hook adapter.
#
# Translates between the Claude Code hook protocol (JSON on stdin, JSON on
# stdout, exit 0) and the harness-agnostic policy in
# scripts/agent-security/policy.sh.
#
# Protocol reference: https://code.claude.com/docs/en/hooks
# ---------------------------------------------------------------------------
set -uo pipefail

CC_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CC_POLICY="$CC_PROJECT_DIR/scripts/agent-security/policy.sh"

# --- output helpers (defined before the policy load so we can fail closed) ---

cc__escape() { # minimal JSON escaping, used only if the policy lib is missing
  local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

cc_esc() {
  if command -v agp_json_escape >/dev/null 2>&1; then agp_json_escape "$1"; else cc__escape "$1"; fi
}

cc_decide() { # <allow|ask|deny> <reason>
  case "$1" in
    deny|ask)
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' \
        "$1" "$(cc_esc "$2")"
      ;;
    *)
      # Stay silent on allow. Emitting "allow" would auto-approve the call and
      # bypass the user's own permission settings - the guard must only ever
      # tighten, never loosen.
      :
      ;;
  esac
  exit 0
}

cc_context() { # <hookEventName> <additionalContext> [systemMessage]
  if [ -n "${3:-}" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s","systemMessage":"%s"}}\n' \
      "$1" "$(cc_esc "$2")" "$(cc_esc "$3")"
  else
    printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
      "$1" "$(cc_esc "$2")"
  fi
  exit 0
}

# --- fail closed: a missing/unreadable policy must not silently disable the guard
if [ ! -r "$CC_POLICY" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
    "Security policy scripts/agent-security/policy.sh is missing or unreadable, so this tool call cannot be validated. Restore it from Git (git checkout -- scripts/agent-security) before continuing."
  exit 0
fi
# shellcheck source=../../scripts/agent-security/policy.sh
. "$CC_POLICY"

# --- input helpers ----------------------------------------------------------

CC_PAYLOAD=""
cc_read_payload() { CC_PAYLOAD="$(cat)"; }

# Read one field from the payload. jq preferred, python3 as fallback; if the
# host has neither, callers degrade to scanning the raw payload.
cc_get() { # <jq-path e.g. .tool_input.command>
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$CC_PAYLOAD" | jq -r "${1} // empty" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$CC_PAYLOAD" | CC_PATH="$1" python3 -c '
import json, os, sys
try:
    node = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for part in os.environ["CC_PATH"].strip(".").split("."):
    if isinstance(node, dict):
        node = node.get(part)
    else:
        node = None
    if node is None:
        sys.exit(0)
print(node if isinstance(node, str) else json.dumps(node))
' 2>/dev/null
  fi
}

# First non-empty field among several candidates.
cc_get_any() { # <jq-path>...
  local p v
  for p in "$@"; do
    v="$(cc_get "$p")"
    [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  done
}

# Every string value inside an object, newline separated (used for MCP tools,
# whose argument names are server specific and cannot be enumerated).
cc_get_strings() { # <jq-path>
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$CC_PAYLOAD" | jq -r "[${1} // {} | .. | strings] | .[]" 2>/dev/null
  else
    printf '%s' "$CC_PAYLOAD"
  fi
}

cc_tool_name() { cc_get '.tool_name'; }
