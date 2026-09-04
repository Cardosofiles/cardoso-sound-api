#!/usr/bin/env bash
# PreToolUse: WebFetch|WebSearch - block SSRF targets and out-of-band exfil sinks.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
URL="$(cc_get_any '.tool_input.url')"
QUERY="$(cc_get_any '.tool_input.prompt' '.tool_input.query')"

if [ -n "$URL" ]; then
  agp_guard_url "$URL"
  agp_log claude-code WebFetch "$URL"
  case "$AGP_DECISION" in
    deny) cc_decide deny "Blocked by the project agent-security policy. $AGP_REASON" ;;
    ask)  cc_decide ask  "The agent-security policy flagged this URL for human review. $AGP_REASON" ;;
  esac
fi

# A search string or fetch prompt that carries a credential would publish it to
# a third party the moment the request leaves the machine.
if [ -n "$QUERY" ]; then
  agp_guard_content "query" "$QUERY"
  if [ "$AGP_DECISION" != "allow" ]; then
    agp_log claude-code WebFetchQuery "$QUERY"
    cc_decide deny "Blocked by the project agent-security policy: the request text appears to contain a credential, and sending it to a third-party service would disclose it. $AGP_REASON"
  fi
fi

exit 0
