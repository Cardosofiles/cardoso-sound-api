# 🎛️ Claude Code Configuration (Opus 5)

This directory holds the workspace configuration for **Claude Code (`claude`)**, running as
**Opus 5**. Claude Code is the **Staff Engineer and technical head** of `cardoso-sound-api`
(D-42): it owns the contract between the Fastify API and the Flutter client, and it does not
normally write the feature code — the **Antigravity agents** in [`.agents/`](../.agents/README.md)
do.

The role itself is defined in [`CLAUDE.md`](../CLAUDE.md) at the repository root, which Claude
Code loads automatically on every session. **This directory is the tooling around that role**:
review subagents, security hooks and long-lived notes.

---

## 📁 Directory Structure

```
.claude/
├── settings.json            # Project-scoped hook registration (versioned)
│                            # settings.local.json is per-clone and gitignored
│
├── agents/                  # Read-only review subagents (Opus)
│   ├── architecture-review.md # Layer boundaries, ADR conformance, contract drift
│   ├── code-review.md         # Correctness, type safety, conventions, test coverage
│   └── security-review.md     # AuthZ/IDOR, validation, secrets, error leakage, rate limit
│
├── hooks/                   # Runtime guardrails — see hooks/README.md
│   ├── lib/adapter.sh              # Claude Code hook protocol <-> shared security policy
│   ├── session-security-context.sh # SessionStart: states the active policy once
│   ├── guard-user-prompt.sh        # UserPromptSubmit: warns on pasted credentials
│   ├── guard-bash.sh               # PreToolUse Bash: destructive/exfiltrating commands
│   ├── guard-file-write.sh         # PreToolUse Write|Edit: secret literals, guardrail files
│   ├── guard-file-read.sh          # PreToolUse Read|Glob|Grep: credential material
│   ├── guard-web-access.sh         # PreToolUse WebFetch|WebSearch: SSRF, exfiltration sinks
│   ├── guard-mcp.sh                # PreToolUse mcp__.*: every string argument
│   └── inspect-untrusted-output.sh # PostToolUse: prompt-injection heuristics
│
└── memory/                  # Long-lived notes that outlive a session
    └── handoff-migracao-audio-r2.md # SoundHelix → Cloudflare R2: decided, NOT an ADR
```

---

## 🏛️ Who decides what (D-42)

This directory is the **direction** half of a two-layer setup:

| Layer                                     | Owns                                                                     | Artifacts                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Staff Engineer** — Claude Code (Opus 5) | Technical direction: specs, sprint briefs, ADRs, conventions, review     | `docs/specs/**`, `docs/sprints/**`, `.agents/memory/DECISIONS.md`, `.agents/rules/**`, `.claude/agents/**` |
| **Antigravity agents** — `.agents/`       | Execution: plan, implement, validate, deliver the PR, record the outcome | `src/**`, `tests/**`, `docs/agents-plans/**`, `.agents/memory/PROGRESS.md`, `.agents/memory/F<n>-S<nn>.md` |

The unit of delivery is the **sprint brief** in `docs/sprints/**`, written by Claude Code and
following the **D-30 anatomy** — literal opening prompt · objective · required specs · expected
contracts · **closed blast radius** · step by step · mandatory test cases · DoD with commands ·
red-CI protocol · what to record · known traps. _A sprint without a blast radius is not
executable._ An ambiguous brief makes the agent guess, and the guess is the Staff Engineer's
defect, not the agent's.

The seven-step session protocol (`docs/specs/07-protocolo-dos-agentes.md`) is unchanged: the
execution agent still plans (Etapa 2 → `docs/agents-plans/`) and still waits for the owner's
explicit authorization (Etapa 3 ⏸). Only the origin of the brief changed.

---

## ⚖️ Chain of authority

When sources disagree, the higher row wins:

1. `.agents/memory/DECISIONS.md` — the ADRs (`D-01`…`D-60`). **Single source of truth.**
2. `docs/specs/**` — 00 vision · 01 architecture · 02 data model · 03 API contract ·
   04 auth & security · 05 testing · 06 git/CI/CD · 07 agent protocol.
3. `.agents/rules/**` (conventions) · `.agents/skills/**` (runbooks).
4. The sprint brief in `docs/sprints/**` for the work in flight.
5. `README.md`, `AGENTS.md` — orientation, **non-normative**. Drift here is a bug to report.

**ADRs live in `DECISIONS.md` (D-24) — there is no `docs/adr/`.** `docs/agents-plans/**` and
`.agents/memory/F<n>-S<nn>.md` record the past; they do not authorize the future.

---

## 👥 Review Subagents

Read-only reviewers in [`agents/`](./agents), invoked through the Agent tool. Each declares
`tools: Read, Grep, Glob` and `model: opus` — **no shell**, so none of them can edit a file,
run a gate, or produce a diff. The caller states the review target (a pasted diff, a
changed-file list, a module, a set of paths); a reviewer given no target asks instead of
sweeping the repository. They report; they never edit.

| Subagent                                                 | Gate                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`architecture-review`](./agents/architecture-review.md) | Layer boundaries, ADR conformance, HTTP/OpenAPI contract drift, spec ↔ code |
| [`code-review`](./agents/code-review.md)                 | Correctness, type safety, conventions, coverage of new behavior             |
| [`security-review`](./agents/security-review.md)         | AuthZ/IDOR, input validation, secrets, error leakage, rate limiting         |

**When to run them:** `architecture-review` before authoring a brief that changes structure;
all three on the diff of a finished sprint, before the PR is opened. `security-review` on every
new or changed route.

Because they cannot run a command, a reviewer never claims a gate passed — it names the command
the caller should run to confirm a finding.

---

## 🛡️ Security Hooks

Registered in [`settings.json`](./settings.json) (project scope, **versioned** — unlike
`.agents/hooks.json`, which is per-clone) and implemented in
[`hooks/`](./hooks/README.md). They enforce the shared policy in
`scripts/agent-security/policy.sh`, the same policy `.agents/hooks/` enforces for Antigravity —
**one denylist, two harnesses**.

| Event              | Matcher                                    | Hook                                                                                                  |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `SessionStart`     | –                                          | States the active policy once, so a denial is understood, not worked around                           |
| `UserPromptSubmit` | –                                          | Warns when a live credential was pasted. **Never blocks the user**                                    |
| `PreToolUse`       | `Bash`                                     | Destructive commands, force pushes, `--no-verify`, `curl \| bash`, exfiltration, privilege escalation |
| `PreToolUse`       | `Write\|Edit\|NotebookEdit`                | Protects `.env` and guardrail files; blocks secret literals before disk                               |
| `PreToolUse`       | `Read\|Glob\|Grep`                         | Keeps `~/.ssh`, `~/.aws`, `/etc/shadow` out of the model context                                      |
| `PreToolUse`       | `WebFetch\|WebSearch`                      | Cloud metadata endpoints, exfiltration sinks, credentials inside a query                              |
| `PreToolUse`       | `mcp__.*`                                  | Runs every string argument through the command and URL policy                                         |
| `PostToolUse`      | `WebFetch\|WebSearch\|Read\|Bash\|mcp__.*` | Flags prompt-injection shaped content so it is treated as data                                        |

Two invariants worth knowing before editing a hook: **allow is silence** — emitting
`"permissionDecision":"allow"` would auto-approve the call and bypass the user's permission
settings, and a guard may only tighten; and a **missing policy file denies** rather than failing
open. Denied and flagged calls land in `.agent-guard.log` (gitignored).

Run `bash scripts/agent-security/test-hooks.sh` after changing a hook. If a legitimate task is
blocked, explain what was needed and let the owner run it or amend the policy — never disable
the hooks.

---

## 🧠 Memory

[`memory/`](./memory) holds notes that must survive a session but are **not** decisions.

- [`handoff-migracao-audio-r2.md`](./memory/handoff-migracao-audio-r2.md) — the SoundHelix →
  Cloudflare R2 move, recorded as "decided, not implemented". **It is not an ADR, so per D-24
  it does not bind.** It either gets promoted to the next free `D-NN` or the seed stays on
  SoundHelix. Until then, treat it as a proposal.

Project state and sprint history are **not** here — they live in `.agents/memory/PROGRESS.md`
and `.agents/memory/F<n>-S<nn>.md`, written by the execution agents.

---

## ✅ Definition of Done

`pnpm typecheck` → `pnpm lint` → `pnpm format` → `pnpm test` → `pnpm build`, all green, plus
tests covering the new behavior and the memory files updated in the same PR. **If a gate has not
been run, say so.** Nothing is declared done on an assumption.

---

## 🗣️ Language (D-25)

`docs/**`, `README.md` and the root `AGENTS.md` are **PT-BR**. `.agents/**`, `.claude/**` and
`CLAUDE.md` — including this file — are **English**. Match the language of the file you edit;
answer the owner in the language they wrote in.
