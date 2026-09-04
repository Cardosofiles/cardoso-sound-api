#!/usr/bin/env bash
# PreToolUse: Bash - block destructive, exfiltrating or privilege-escalating shell commands.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
COMMAND="$(cc_get_any '.tool_input.command')"
[ -z "$COMMAND" ] && exit 0

agp_guard_command "$COMMAND"
agp_log claude-code Bash "$COMMAND"

case "$AGP_DECISION" in
  deny) cc_decide deny "Blocked by the project agent-security policy. $AGP_REASON Suggest a safer command, or ask the user to run it themselves from their own shell." ;;
  ask)  cc_decide ask  "The agent-security policy flagged this command for human review. $AGP_REASON" ;;
  *)    exit 0 ;;
esac
