# Antigravity CLI security hooks

Adapters between the Antigravity (`agy`) hook protocol and the shared policy in
`scripts/agent-security/policy.sh`. Registered in `.agents/hooks.json` under the
`agent-security` group.

| Hook                     | Event         | Matcher                                                                                                                                    | What it does                                                                                                                                                     |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block_rm.sh`            | `PreToolUse`  | `run_command`                                                                                                                              | Full shell-command policy: destructive deletes, force pushes, hook bypass, `curl \| bash`, credential reads, exfiltration, privilege escalation, destructive SQL |
| `guard_file_ops.sh`      | `PreToolUse`  | `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `edit_file`, `view_file`, `list_dir`, `find_by_name`, `grep_search` | Protects secret files and guardrails on write; keeps credential material out of context on read                                                                  |
| `guard_web_access.sh`    | `PreToolUse`  | `read_url_content`, `search_web`                                                                                                           | Cloud metadata endpoints, exfiltration sinks, credentials inside a query                                                                                         |
| `inspect_tool_output.sh` | `PostToolUse` | `read_url_content`, `search_web`, `view_file`, `run_command`                                                                               | Flags prompt-injection shaped content and records it in the audit log                                                                                            |

`block_rm.sh` keeps its original name for config compatibility; its scope is now
the whole command policy, not just `rm`.

## Protocol notes

- stdin: `{"toolCall":{"name":"...","args":{...}},"stepIdx":N,"conversationId":"..."}`
- stdout: `{"decision":"allow|deny|ask|force_ask|deny_unless_prior_grant","reason":"..."}`
- Argument names vary per tool and per version, so `lib/adapter.sh` tries a list
  of candidates (`CommandLine`, `Command`, `command`, …) rather than assuming
  one shape.
- With neither `jq` nor `python3` on the host, `block_rm.sh` scans the raw
  payload instead of skipping the check — coarse, never silently permissive.
- If `scripts/agent-security/policy.sh` is missing, the adapter denies rather
  than failing open.

## Default decision

When no rule fires the adapters answer `allow`, matching the behaviour of the
original hook. For a stricter posture that still honours permissions the user
already granted, export:

```bash
AGY_DEFAULT_DECISION=deny_unless_prior_grant
```

## Setup: hooks.json is per-clone

Antigravity CLI 1.1.25 resolves hook commands from its own working directory,
not from the workspace root, so workspace-relative commands
(`./.agents/hooks/...`) fail with `exit status 127` and every tool call is
refused — the harness fails closed, so the agent loses `run_command`,
`view_file` and `search_web` at once, not just the guarded operations.

The commands must therefore be absolute, which makes them machine-specific.
`.agents/hooks.json` is git-ignored for that reason; the committed template is
`.agents/hooks.json.example`. After cloning:

```bash
cp .agents/hooks.json.example .agents/hooks.json
sed -i "s#\"\./\.agents/hooks/#\"$PWD/.agents/hooks/#g" .agents/hooks.json
bash scripts/agent-security/test-hooks.sh
```

To confirm the hooks fire from an arbitrary directory — the condition that
actually broke:

```bash
cd /tmp && printf '%s' '{"toolCall":{"name":"run_command","args":{"CommandLine":"rm -rf /"}}}' \
  | sh -c "$OLDPWD/.agents/hooks/block_rm.sh"   # must answer deny, never 127
```

Tests: `bash scripts/agent-security/test-hooks.sh`.
