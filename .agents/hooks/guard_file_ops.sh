#!/usr/bin/env bash
# PreToolUse: view_file | list_dir | find_by_name | grep_search |
#             write_to_file | replace_file_content | multi_replace_file_content
#
# Keeps credential material out of the model context on reads, and keeps
# secrets and guardrail tampering out of the working tree on writes.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

agy_read_payload
TOOL="$(agy_tool_name)"

case "$TOOL" in
  write_to_file|replace_file_content|multi_replace_file_content|edit_file) OP="write" ;;
  *) OP="read" ;;
esac

TARGET="$(agy_path)"
if [ -n "$TARGET" ]; then
  REL_PATH="${TARGET#"$AGY_REPO_ROOT"/}"
  agp_guard_path "$OP" "$REL_PATH"
  agp_log antigravity "$OP:$TOOL" "$REL_PATH"
  agy_respond
fi

if [ "$OP" = "write" ]; then
  CONTENT="$(agy_content)"
  if [ -n "$CONTENT" ]; then
    agp_guard_content "${TARGET:-unknown}" "$CONTENT"
    agp_log antigravity "content:$TOOL" "${TARGET:-unknown}"
    agy_respond "Never commit real credentials - declare the variable in .env.example and read it through src/config/env.ts. "
  fi
fi

agy_allow
