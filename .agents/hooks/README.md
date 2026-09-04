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

## Path caveat

`hooks.json` uses workspace-relative commands (`./.agents/hooks/...`). Some
Antigravity builds require an absolute path; if the hooks do not fire, replace
them with the absolute path to this directory and re-test.

Tests: `bash scripts/agent-security/test-hooks.sh`.
