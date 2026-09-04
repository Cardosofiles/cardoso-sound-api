# 🤖 Antigravity Agent Configuration (Gemini 3.8 Flash)

This directory contains the workspace customization configuration for **Google Antigravity CLI (`agy`)**, specifically tailored for the **Gemini 3.8 Flash** model execution.

---

## 📁 Directory Structure

```
.agents/
├── mcp_config.json          # Model Context Protocol servers configuration
├── hooks.json               # Security hook registration (PreToolUse / PostToolUse)
├── README.md                # Overview of workspace agents and capabilities
│
├── hooks/                   # Runtime guardrails - see hooks/README.md
│   ├── lib/adapter.sh       # Antigravity hook protocol <-> shared security policy
│   ├── block_rm.sh          # run_command: destructive, exfiltrating, escalating commands
│   ├── guard_file_ops.sh    # file tools: secret files, credential material, guardrails
│   ├── guard_web_access.sh  # read_url_content / search_web: SSRF and exfiltration sinks
│   └── inspect_tool_output.sh # PostToolUse: prompt-injection heuristics on untrusted output
│
├── rules/                   # Contextual and domain rules (loaded automatically)
│   ├── architecture.md      # Clean Architecture, layer boundaries, and Fastify patterns
│   ├── coding-standards.md  # TypeScript strictness, naming conventions, Zod validation
│   ├── database.md          # PostgreSQL and Drizzle ORM conventions
│   ├── auth.md              # Better Auth integration, decorators, route protection
│   └── testing.md           # Vitest, Testcontainers, and Playwright protocols
│
├── agents/                  # Specialized custom subagents
│   ├── backend-architect.md # Domain design, contracts, interfaces, and architecture
│   ├── db-specialist.md     # PostgreSQL schemas, migrations, connection pool, seeds
│   ├── api-developer.md     # Fastify routes, services, repositories, plugins, jobs
│   ├── qa-engineer.md       # Vitest unit tests, integration tests, E2E specs
│   └── security-reviewer.md # Auth audit, security headers, rate limiting, sanitization
│
└── skills/                  # On-demand procedural workflows
    ├── db-migrate/
    │   └── SKILL.md         # Database migration workflows
    ├── db-seed/
    │   └── SKILL.md         # Catalog seeding procedures (30+ mock tracks)
    ├── test-runner/
    │   └── SKILL.md         # Execution guide for unit, integration, and E2E tests
    └── code-quality/
        └── SKILL.md         # Lint, typecheck, format, and production build checks
```

---

## 🧠 Model Configuration: Gemini 3.8 Flash

All subagents are configured with `model: flash` to leverage **Gemini 3.8 Flash** (`gemini-3.8-flash-high`), delivering:

- High inference speed and rapid feedback loops during pair programming.
- Large context capacity with progressive disclosure of skills and rules.
- Precise tool-calling capabilities for filesystem edits and terminal commands.

---

## 👥 Subagents Overview

| Subagent                                             | Role                                                                         | Primary Skills & Tools              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| [`backend-architect`](./agents/backend-architect.md) | Enforces Clean Architecture, designs DTOs, validates module contracts        | Architecture rules, type validation |
| [`db-specialist`](./agents/db-specialist.md)         | Models Drizzle schemas, manages PostgreSQL migrations & seed data            | `db-migrate`, `db-seed`             |
| [`api-developer`](./agents/api-developer.md)         | Implements Fastify routes, controllers, services, repositories, and plugins  | `code-quality`                      |
| [`qa-engineer`](./agents/qa-engineer.md)             | Develops Vitest unit tests, Testcontainers, and Playwright E2E suites        | `test-runner`                       |
| [`security-reviewer`](./agents/security-reviewer.md) | Audits Better Auth, Fastify decorators, rate limiting, and defensive headers | `code-quality`, security audit      |

---

## 📜 Rules Engine

Rules in `.agents/rules/` are automatically discovered and loaded by Antigravity when operating within the repository. They govern:

- **Clean Architecture & boundaries**: No SQL in routes, no HTTP in services.
- **Strict typing**: Zero `any`, typed Zod schemas with `fastify-type-provider-zod`.
- **Database integrity**: Explicit foreign keys, cascade deletes, composite primary keys on junction tables.
- **Authentication**: Session decoration on `FastifyRequest`, route authorization guards.
- **Testing**: Deterministic, isolated test execution with Testcontainers and Vitest.

---

## 🛡️ Security Hooks

Registered in [`.agents/hooks.json`](./hooks.json), implemented in
[`.agents/hooks/`](./hooks/README.md). They enforce the shared policy in
`scripts/agent-security/policy.sh`, which is also enforced for Claude Code via
`.claude/hooks/` — one denylist, two harnesses.

- **`PreToolUse`** blocks destructive shell commands, force pushes, hook bypass
  (`--no-verify`), `curl | bash`, credential reads, secret exfiltration,
  privilege escalation, SSRF/cloud-metadata targets and destructive SQL.
- **`PreToolUse`** on file tools stops secrets from being written to disk and
  routes guardrail edits through human review.
- **`PostToolUse`** flags prompt-injection shaped content in fetched pages and
  command output, so untrusted text is treated as data, never as instructions.

Denied and flagged calls are appended to `.agent-guard.log` (gitignored).
Run `bash scripts/agent-security/test-hooks.sh` after changing a hook.

---

## 🛠️ MCP Servers Integration

Configured in [`.agents/mcp_config.json`](./mcp_config.json):

- **context7**: Upstash documentation retrieval.
- **github**: Repository, issue, and pull request management.
- **postgres**: Direct query inspection against the PostgreSQL database.
- **playwright**: Browser automation and end-to-end verification.

---

## 📋 Persistência de Planos dos Agentes

Todos os artefatos de planejamento e execução gerados em `/home/joaocardoso/.gemini/antigravity-cli/brain/**/**.md` devem ser salvos/copiados obrigatoriamente no repositório em:
`docs/agents-plans/` (`/run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/`).
