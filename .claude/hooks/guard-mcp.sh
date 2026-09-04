#!/usr/bin/env bash
# PreToolUse: mcp__.* - MCP servers reach real systems (Postgres, GitHub, a
# browser). Their argument names are server specific, so every string argument
# is run through the command and URL policy.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
TOOL="$(cc_tool_name)"

while IFS= read -r value; do
  [ -z "$value" ] && continue

  agp_guard_url "$value"
  if [ "$AGP_DECISION" = "deny" ]; then
    agp_log claude-code "$TOOL" "$value"
    cc_decide deny "Blocked by the project agent-security policy (MCP tool $TOOL). $AGP_REASON"
  fi

  agp_guard_command "$value"
  if [ "$AGP_DECISION" = "deny" ]; then
    agp_log claude-code "$TOOL" "$value"
    cc_decide deny "Blocked by the project agent-security policy (MCP tool $TOOL). $AGP_REASON Schema changes belong in a reviewed drizzle migration, not an ad-hoc MCP call."
  fi
done <<< "$(cc_get_strings '.tool_input')"

exit 0
