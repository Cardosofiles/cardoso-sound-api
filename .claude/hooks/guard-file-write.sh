#!/usr/bin/env bash
# PreToolUse: Write|Edit|NotebookEdit - protect secret files and guardrails, and
# stop credentials from being written into the working tree in the first place.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

cc_read_payload
FILE_PATH="$(cc_get_any '.tool_input.file_path' '.tool_input.notebook_path' '.tool_input.path')"
[ -z "$FILE_PATH" ] && exit 0

# Relative to the project root, so policy patterns read the same way in logs.
REL_PATH="${FILE_PATH#"$CC_PROJECT_DIR"/}"

agp_guard_path write "$REL_PATH"
PATH_DECISION="$AGP_DECISION"; PATH_REASON="$AGP_REASON"

CONTENT="$(cc_get_any '.tool_input.content' '.tool_input.new_string' '.tool_input.new_source')"
agp_guard_content "$REL_PATH" "$CONTENT"
CONTENT_DECISION="$AGP_DECISION"; CONTENT_REASON="$AGP_REASON"

# Most severe of the two wins.
DECISION="allow"; REASON=""
for pair in "$PATH_DECISION|$PATH_REASON" "$CONTENT_DECISION|$CONTENT_REASON"; do
  d="${pair%%|*}"; r="${pair#*|}"
  [ "$d" = "allow" ] && continue
  if [ "$DECISION" = "allow" ] || { [ "$DECISION" = "ask" ] && [ "$d" = "deny" ]; }; then
    DECISION="$d"
  fi
  REASON="${REASON:+$REASON }$r"
done

AGP_DECISION="$DECISION"
agp_log claude-code "write:$(cc_tool_name)" "$REL_PATH"

case "$DECISION" in
  deny) cc_decide deny "Blocked by the project agent-security policy. $REASON Never commit real credentials: declare the variable in .env.example and read it through src/config/env.ts." ;;
  ask)  cc_decide ask  "The agent-security policy flagged this write for human review. $REASON" ;;
  *)    exit 0 ;;
esac
