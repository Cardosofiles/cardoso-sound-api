# Claude Code security hooks

Adapters between the [Claude Code hook protocol](https://code.claude.com/docs/en/hooks)
and the shared policy in `scripts/agent-security/policy.sh`. Registered in
`.claude/settings.json` (project scope, versioned).

| Hook                          | Event              | Matcher                                    | What it does                                                                                                            |
| ----------------------------- | ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `session-security-context.sh` | `SessionStart`     | –                                          | States the active policy once, so a denial is understood instead of worked around                                       |
| `guard-user-prompt.sh`        | `UserPromptSubmit` | –                                          | Warns when a live credential was pasted into the prompt. **Never blocks the user**                                      |
| `guard-bash.sh`               | `PreToolUse`       | `Bash`                                     | Destructive commands, force pushes, `--no-verify`, `curl \| bash`, credential reads, exfiltration, privilege escalation |
| `guard-file-write.sh`         | `PreToolUse`       | `Write\|Edit\|NotebookEdit`                | Protects `.env` and guardrail files; blocks secret literals before they reach disk                                      |
| `guard-file-read.sh`          | `PreToolUse`       | `Read\|Glob\|Grep`                         | Keeps `~/.ssh`, `~/.aws`, `/etc/shadow` and friends out of the model context                                            |
| `guard-web-access.sh`         | `PreToolUse`       | `WebFetch\|WebSearch`                      | Cloud metadata endpoints, exfiltration sinks, credentials inside a query                                                |
| `guard-mcp.sh`                | `PreToolUse`       | `mcp__.*`                                  | Runs every string argument through the command and URL policy                                                           |
| `inspect-untrusted-output.sh` | `PostToolUse`      | `WebFetch\|WebSearch\|Read\|Bash\|mcp__.*` | Flags prompt-injection shaped content so it is treated as data                                                          |

## Protocol notes

- **Deny/ask** is emitted as
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`.
- **Allow is silence.** The hooks exit 0 with no output when the policy is
  quiet. Emitting `"permissionDecision":"allow"` would auto-approve the call and
  bypass the permission settings the user configured — a guard may only
  tighten, never loosen.
- `PostToolUse` cannot block (the tool already ran), so it returns
  `additionalContext` plus a `systemMessage`.
- Every hook resolves the project root from `$CLAUDE_PROJECT_DIR`.

## Conventions

- `lib/adapter.sh` owns payload parsing (jq, falling back to python3) and JSON
  emission. Hook scripts stay short enough to audit at a glance.
- JSON output escaping is pure bash, so a denial can still be reported on a
  host without `jq`.
- If `scripts/agent-security/policy.sh` is missing, the adapter denies rather
  than failing open.

Tests: `bash scripts/agent-security/test-hooks.sh`.
