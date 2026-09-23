#!/usr/bin/env bash
# PostToolUse: read_url_content | view_file | search_web | run_command
#
# Fetched pages, files and command output are untrusted input. This hook does
# not block - it records the detection in the audit log and returns a reason
# describing what the content tried to make the agent do, so the finding is
# visible instead of silently obeyed.
. "$(dirname "${BASH_SOURCE[0]}")/lib/adapter.sh"

agy_read_payload
TOOL="$(agy_tool_name)"
SOURCE="$(agy_url)"
[ -z "$SOURCE" ] && SOURCE="$(agy_path)"

# The result field name is not stable across versions, so scan the whole
# payload, capped so hook latency stays off the critical path.
RESULT="$(printf '%s' "$AGY_PAYLOAD" | head -c 60000)"
HITS="$(agp_scan_injection "$RESULT")"
[ -z "$HITS" ] && { echo "{}"; exit 0; }

AGP_DECISION="ask"
AGP_RULES="$HITS"
agp_log antigravity "injection:$TOOL" "${SOURCE:-unknown}"

# PostToolUse contract in Antigravity CLI expects an empty JSON object {}
echo "{}"
exit 0
