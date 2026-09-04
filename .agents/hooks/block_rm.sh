#!/usr/bin/env bash
# PreToolUse: run_command
#
# Blocks destructive, exfiltrating, privilege-escalating and supply-chain shell
# commands. The file name is kept for config compatibility, but the scope is
# now the full command policy, not just `rm`.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

agy_read_payload

if agy_degraded; then
  # No JSON parser on this host: scan the whole payload rather than nothing.
  agp_guard_command "$AGY_PAYLOAD"
  agp_log antigravity run_command "degraded-scan"
  agy_respond "No JSON parser (jq/python3) available, so the raw payload was scanned. "
  agy_allow
fi

COMMAND="$(agy_command)"
[ -z "$COMMAND" ] && agy_allow

agp_guard_command "$COMMAND"
agp_log antigravity run_command "$COMMAND"
agy_respond
agy_allow
