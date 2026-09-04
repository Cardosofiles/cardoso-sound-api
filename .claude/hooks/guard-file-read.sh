#!/usr/bin/env bash
# PreToolUse: Read|Glob|Grep - keep credential material out of the model context.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
TARGET="$(cc_get_any '.tool_input.file_path' '.tool_input.notebook_path' '.tool_input.path' '.tool_input.pattern')"
[ -z "$TARGET" ] && exit 0

REL_PATH="${TARGET#"$CC_PROJECT_DIR"/}"
agp_guard_path read "$REL_PATH"
agp_log claude-code "read:$(cc_tool_name)" "$REL_PATH"

case "$AGP_DECISION" in
  deny) cc_decide deny "Blocked by the project agent-security policy. $AGP_REASON" ;;
  ask)  cc_decide ask  "The agent-security policy flagged this read for human review. $AGP_REASON" ;;
  *)    exit 0 ;;
esac
