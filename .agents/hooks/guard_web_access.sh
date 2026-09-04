#!/usr/bin/env bash
# PreToolUse: read_url_content | search_web
#
# Blocks SSRF targets, cloud metadata endpoints and known exfiltration sinks,
# and refuses to send credential-shaped text to a third party.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

agy_read_payload

URL="$(agy_url)"
if [ -n "$URL" ]; then
  agp_guard_url "$URL"
  agp_log antigravity read_url_content "$URL"
  agy_respond
fi

QUERY="$(agy_query)"
if [ -n "$QUERY" ]; then
  agp_guard_content "web-query" "$QUERY"
  if [ "$AGP_DECISION" != "allow" ]; then
    agp_log antigravity search_web "credential-shaped query"
    agy_emit deny "Blocked by the project agent-security policy: the query appears to contain a credential, and sending it to a third-party service would disclose it. $AGP_REASON"
  fi
fi

agy_allow
