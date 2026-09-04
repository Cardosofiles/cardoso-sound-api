#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Antigravity CLI (agy) hook adapter.
#
# Translates between the Antigravity hook protocol and the harness-agnostic
# policy in scripts/agent-security/policy.sh.
#
#   stdin  : {"toolCall":{"name":"...","args":{...}},"stepIdx":N,...}
#   stdout : {"decision":"allow|ask|deny|force_ask|deny_unless_prior_grant",
#             "reason":"..."}
# ---------------------------------------------------------------------------
set -uo pipefail

AGY_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGY_REPO_ROOT="${AGY_REPO_ROOT:-$(cd "$AGY_HOOK_DIR/../.." && pwd)}"
AGY_POLICY="$AGY_REPO_ROOT/scripts/agent-security/policy.sh"

# What to answer when nothing in the policy fires. "allow" grants the call;
# set AGY_DEFAULT_DECISION=deny_unless_prior_grant for a stricter posture that
# still defers to permissions the user already granted.
AGY_DEFAULT_DECISION="${AGY_DEFAULT_DECISION:-allow}"

agy__escape() {
  local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

agy_esc() {
  if command -v agp_json_escape >/dev/null 2>&1; then agp_json_escape "$1"; else agy__escape "$1"; fi
}

agy_emit() { # <decision> [reason]
  if [ -n "${2:-}" ]; then
    printf '{"decision": "%s", "reason": "%s"}\n' "$1" "$(agy_esc "$2")"
  else
    printf '{"decision": "%s"}\n' "$1"
  fi
  exit 0
}

agy_allow() { agy_emit "$AGY_DEFAULT_DECISION" "${1:-}"; }

# Fail closed: without the policy the guard cannot make a judgement.
if [ ! -r "$AGY_POLICY" ]; then
  printf '{"decision": "deny", "reason": "%s"}\n' \
    "Security policy scripts/agent-security/policy.sh is missing or unreadable, so this tool call cannot be validated. Restore it from Git before continuing."
  exit 0
fi
# shellcheck source=../../scripts/agent-security/policy.sh
. "$AGY_POLICY"

AGY_PAYLOAD=""

# True when the payload is well-formed JSON, or when no parser is available to
# tell (the degraded path below is coarse but scans the raw text).
agy__payload_parses() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$AGY_PAYLOAD" | jq -e . >/dev/null 2>&1
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$AGY_PAYLOAD" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1
  else
    return 0
  fi
}

# Fail closed on an unreadable envelope. Field extraction returns empty for
# every key when the JSON is malformed, which would otherwise walk past every
# check and land on the permissive default.
agy_read_payload() {
  AGY_PAYLOAD="$(cat)"
  if [ -z "$AGY_PAYLOAD" ] || ! agy__payload_parses; then
    agy_emit ask \
      "The agent-security guard could not parse this tool call payload, so the project policy could not be applied to it. Approve only if you can see what the call does."
  fi
}

agy_get() { # <jq-path>
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$AGY_PAYLOAD" | jq -r "${1} // empty" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$AGY_PAYLOAD" | AGY_PATH="$1" python3 -c '
import json, os, sys
try:
    node = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for part in os.environ["AGY_PATH"].strip(".").split("."):
    node = node.get(part) if isinstance(node, dict) else None
    if node is None:
        sys.exit(0)
print(node if isinstance(node, str) else json.dumps(node))
' 2>/dev/null
  fi
}

agy_get_any() { # <jq-path>...
  local p v
  for p in "$@"; do
    v="$(agy_get "$p")"
    [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  done
}

agy_tool_name() { agy_get '.toolCall.name'; }

# True when no JSON parser is available; callers then fall back to scanning the
# raw payload, which is coarse but never silently permissive.
agy_degraded() {
  ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1
}

# Argument names differ per tool version, so keep generous candidate lists.
agy_command() { agy_get_any '.toolCall.args.CommandLine' '.toolCall.args.Command' '.toolCall.args.command' '.toolCall.args.cmd'; }
agy_path()    { agy_get_any '.toolCall.args.TargetFile' '.toolCall.args.AbsolutePath' '.toolCall.args.Path' '.toolCall.args.path' '.toolCall.args.file_path' '.toolCall.args.SearchDirectory' '.toolCall.args.DirectoryPath'; }
agy_content() { agy_get_any '.toolCall.args.CodeContent' '.toolCall.args.ReplacementContent' '.toolCall.args.content' '.toolCall.args.NewString' '.toolCall.args.TargetContent'; }
agy_url()     { agy_get_any '.toolCall.args.Url' '.toolCall.args.URL' '.toolCall.args.url'; }
agy_query()   { agy_get_any '.toolCall.args.Query' '.toolCall.args.query' '.toolCall.args.SearchQuery'; }

# Map a policy decision onto an Antigravity response.
agy_respond() { # [prefix-reason]
  case "$AGP_DECISION" in
    deny) agy_emit deny "${1:-}Blocked by the project agent-security policy. $AGP_REASON" ;;
    ask)  agy_emit ask  "${1:-}Flagged by the project agent-security policy for human review. $AGP_REASON" ;;
    *)    return 0 ;;
  esac
}
