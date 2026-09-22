#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PreToolUse guard: the agent stays inside this project.
#
# Denies any tool call whose target resolves outside CLAUDE_PROJECT_DIR -
# `../../other-project`, `~/`, an absolute path elsewhere on the machine, a
# `cd` out of the tree, or a symlink inside the repo that points outside it.
# A short allow-list keeps the toolchain working (/usr, /bin, /dev/null, the
# agent scratchpad and this project's own Claude Code state).
#
# This covers the paths the *model* asks for. The paths the *owner* types as
# `@` references never reach a tool call - they are expanded into the prompt
# before any PreToolUse hook runs - so guard-prompt-scope.sh covers those, with
# the same boundary from lib/hook-scope.sh (D-75).
#
# Self-contained: backed by lib/hook-io.sh and lib/hook-scope.sh, not by
# scripts/agent-security/policy.sh. The policy has no directory boundary of its
# own; this is the only thing that enforces one.
#
# Wired in .claude/settings.json to Read|Write|Edit|NotebookEdit|Glob|Grep|Bash
# and to mcp__.*.
# ---------------------------------------------------------------------------
. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-io.sh"
. "$(dirname "${BASH_SOURCE[0]}")/lib/hook-scope.sh"

hk_init
hk_scope_init

case "$HK_TOOL" in
  Bash)
    COMMAND="$(hk_get '.tool_input.command')"
    [ -n "$COMMAND" ] || exit 0
    hk_scope_check "$(hk_get '.tool_input.cwd')" "the working directory"
    hk_scope_scan_command "$COMMAND"
    ;;

  Read | Write | Edit | MultiEdit | NotebookEdit)
    hk_scope_check "$(hk_get_any '.tool_input.file_path' '.tool_input.notebook_path' '.tool_input.path')" "the tool target"
    ;;

  Glob)
    hk_scope_check "$(hk_get '.tool_input.path')" "the search path"
    # A glob pattern is path-shaped: **/../../etc would escape just as well.
    PATTERN="$(hk_get '.tool_input.pattern')"
    hk_scope_is_candidate "$PATTERN" && hk_scope_check "$PATTERN" "the glob pattern"
    ;;

  Grep)
    # Only the search root, never the regex - `\.\./` is a valid pattern.
    hk_scope_check "$(hk_get '.tool_input.path')" "the search path"
    ;;

  *)
    # Unknown or MCP tool: only fields whose key looks like a path or command,
    # so a document body that merely mentions ../ is not mistaken for a target.
    while IFS= read -r value; do
      [ -n "$value" ] || continue
      if hk_scope_is_candidate "$value"; then
        hk_scope_check "$value" "$HK_TOOL"
      else
        hk_scope_scan_command "$value"
      fi
    done <<EOF
$(hk_tool_path_values)
EOF
    ;;
esac

exit 0
