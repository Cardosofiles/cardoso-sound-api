# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state: scaffold, not implementation

**Every `.ts` source file, test file, CI workflow, and config file in this repo is currently 0 bytes.** The directory tree, `package.json`, and the documentation are complete; the code is not. Check that a file has content before assuming it does.

Consequences:

- `pnpm typecheck`, `lint`, `build`, and every `db:*` script fail until `tsconfig.json`, `eslint.config.mjs`, `tsup.config.ts`, and `drizzle.config.ts` are written.
- `.env` and `.env.example` are empty — there is no `DATABASE_URL` yet.
- `docker-compose.yml` and `Dockerfile` are empty; the Postgres service the README describes does not exist.
- `drizzle/` (generated migrations) does not exist.

When implementing a feature, bootstrapping the config it depends on is in scope. Intent for each path is already documented: the README's annotated tree explains the purpose of every file, and `.agents/rules/*.md` holds the binding conventions. Read those before creating a file rather than inventing a shape for it.

## Commands

| Command                           | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| `pnpm dev`                        | `tsx watch src/server.ts`                           |
| `pnpm build` / `pnpm start`       | Bundle with tsup → run `dist/server.js`             |
| `pnpm typecheck`                  | `tsc --noEmit` — must be zero errors                |
| `pnpm lint` / `pnpm format`       | ESLint (flat config) / Prettier write               |
| `pnpm test` / `pnpm test:watch`   | Vitest                                              |
| `pnpm vitest run <path>`          | Single test file                                    |
| `pnpm db:generate` → `db:migrate` | Generate SQL into `drizzle/`, review it, then apply |
| `pnpm db:push`                    | Dev-only schema sync, skips migration files         |
| `pnpm db:migrate:deploy`          | Production migrations via `dist/db/migrate.js`      |
| `pnpm db:studio`                  | Drizzle Studio                                      |
| `tsx src/db/seed/seed.ts`         | Seed the catalog (no npm script for this)           |
| `pnpm jobs` / `pnpm jobs:dev`     | Background job runner                               |

Package manager is pnpm 11 (pinned via `packageManager`).

### Documented but not actually wired up

- **Playwright** is the documented E2E runner (README, `.agents/skills/test-runner/`), but it is **not a dependency** — `pnpm playwright test` fails. Install it, or use Fastify's `app.inject()`, before writing E2E specs.
- `pnpm openapi:export` points at `scripts/export-openapi.ts`; `scripts/` does not exist.
- `AGENTS.md` says Zod v3, but the project pins `zod@^4.4.3` with `fastify-type-provider-zod@^6`. **Write Zod 4.**
- Node is stated as 20 (AGENTS.md) vs 22 (README, CI); Postgres as 16 (AGENTS.md) vs 17 (README compose). Ask rather than picking silently.
- `@neondatabase/serverless`, `ws`, and `uuid` are installed but unused; the README flags Neon as "evaluate need" since Postgres is local Docker.

## Architecture

Layered ("simplified Clean Architecture"), modular by domain. Dependencies flow one way:

```
*.routes.ts  →  *.service.ts  →  *.repository.ts  →  Drizzle  →  Postgres
```

- **Routes** — Fastify plugins typed as `FastifyPluginAsyncZod`. Attach Zod schemas for params/query/body/response, delegate to the service. No SQL, no Drizzle, no business rules.
- **Services** — pure business logic. Must not touch `request`/`reply`, which is what keeps them unit-testable against a stubbed repository. Throw `AppError` subclasses on invariant failure; never build error payloads.
- **Repositories** — the only layer that may import from `src/db/`. Converts rows to domain models.
- **`*.schema.ts` is overloaded**: under `src/modules/**` it means Zod DTOs; under `src/db/schema/` it means Drizzle table definitions. Same suffix, different job.

`eslint-plugin-boundaries` is a devDependency specifically so these boundaries get enforced by lint once the config is written.

**Composition** — `src/app.ts` is a factory that registers the plugins in `src/plugins/` (cors, helmet, rate-limit, under-pressure, swagger, error-handler) plus each module's routes and returns the instance. `src/server.ts` only bootstraps, listens, and handles graceful shutdown. Keep `app.ts` free of side effects at import time so tests can build an instance and use `app.inject()`.

**Errors** — every operational failure extends `AppError` (`src/shared/errors/app-error.ts`); `src/plugins/error-handler.plugin.ts` is the single place that formats them into RFC 7807-shaped responses (`{ statusCode, error, message, details }`). Handlers should not catch-and-format locally.

**Auth** — Better Auth is configured once in `src/modules/auth/auth.config.ts` with `drizzleAdapter(db, { provider: 'pg' })` (7-day sessions, 8-char minimum password, its own rate limit). `auth.plugin.ts` mounts the handler under `/api/auth/*` and decorates requests with `request.user` / `request.session`; those properties are declared via module augmentation in `src/shared/types/fastify.d.ts`. Protected routes check `request.user` and throw `UnauthorizedError` (401), or `ForbiddenError` (403) when the resource belongs to another user.

**Database** — one `pg.Pool` and one Drizzle singleton in `src/db/client.ts`, built as `drizzle(pool, { schema })` so relational `db.query.*` works. Domain tables (`artists`, `tracks`, `playlists`) use `uuid('id').primaryKey().defaultRandom()`; Better Auth tables (`user`, `session`, `account`, `verification`) use the text IDs its adapter dictates. Junction tables (`playlist_tracks`, `favorites`) use composite primary keys via `primaryKey({ columns: [...] })`. Foreign keys always declare `onDelete` explicitly. Multi-step mutations go inside `db.transaction()`. Env vars are validated with Zod in `src/config/env.ts` — read config from there, never `process.env` directly.

**Domain** — music catalog backing a Flutter streaming MVP. There is deliberately **no Spotify integration**; the catalog is seeded locally with 5–8 mock artists and 30+ tracks using SoundHelix audio URLs, and the seed must be idempotent (`ON CONFLICT DO NOTHING` or equivalent).

## Conventions

- Strict TypeScript, native ESM (`"type": "module"`, NodeNext resolution). `any` is banned — use `unknown` with a type guard.
- Derive DTO types with `z.infer<typeof schema>` instead of hand-writing interfaces.
- File suffixes are meaningful and required: `*.routes.ts`, `*.service.ts`, `*.repository.ts`, `*.schema.ts`, `*.plugin.ts`, `*.error.ts`.
- Files kebab-case · classes/types PascalCase · functions/variables camelCase · constants UPPER_SNAKE_CASE · DB tables/columns snake_case.
- Log through Fastify's structured logger (`request.log.error(...)`, `fastify.log.info(...)`), not `console`.

## Testing

- **Unit** (`tests/unit/modules/**`) — services and utils with mocked repositories; no network, no DB.
- **Integration** (`tests/integration/**`, harness at `tests/setup/testcontainers.ts`) — ephemeral Postgres via `@testcontainers/postgresql`, migrations applied before assertions. Requires a running Docker daemon.
- **E2E** (`tests/e2e/specs/**`) — full HTTP flows: sign-up/sign-in, cookie handling, playlist creation, track addition, favorites lifecycle.
- Tests must be isolated and side-effect free (`vi.clearAllMocks()` in `beforeEach`).

Before declaring a change done: `pnpm typecheck` → `pnpm lint` → `pnpm format` → `pnpm test` → `pnpm build`.

## Git

**Not currently a git repository**, although husky, commitlint, and lint-staged are configured — after `git init`, run `pnpm prepare` to install the hooks.

Git Flow (`main`, `develop`, `feature/*`, `release/vX.Y.Z`, `hotfix/*`) with Conventional Commits (`feat(scope):`, `fix`, `refactor`, `test`, `chore`, `docs`), enforced by commitlint once `commitlint.config.mjs` has content.

## Notes

- `.agents/` is an Antigravity/Gemini CLI workspace config, but its `rules/` files are the authoritative project conventions and the `skills/` files are the canonical runbooks. Keep them in sync when conventions change.
- README and `AGENTS.md` are written in Portuguese; `.agents/**` is in English. Match the language of the file you are editing.
