# Architecture & Structural Rules

This workspace implements a **Simplified Clean Architecture** organized by domain modules using **Fastify 5** and **TypeScript**.

## 1. Directory & Layer Organization

All application code resides strictly under `src/`:

```
src/
├── config/       # Environment variables validation (Zod) and application constants
├── db/           # Drizzle client, connection pool, migrations, and database schemas
├── modules/      # Feature-based domain modules (auth, users, tracks, artists, playlists, favorites)
├── plugins/      # Fastify infrastructure plugins (CORS, Helmet, Rate Limit, Swagger, etc.)
├── shared/       # Domain error classes, utility helpers, and global type augmentations
├── jobs/         # Scheduled maintenance runners
├── app.ts        # Fastify app factory (registration of plugins and routes)
└── server.ts     # Process entry point (listen, graceful shutdown)
```

## 2. Layer Boundaries & Responsibilities

1. **Routes (`*.routes.ts`)**:
   - Register HTTP endpoints on the Fastify instance using `fastify-type-provider-zod`.
   - Perform request schema validation (params, query, body, response).
   - Delegate business operations directly to the module Service.
   - Do NOT contain SQL queries, ORM calls, or core domain calculations.

2. **Services (`*.service.ts`)**:
   - Contain pure business logic and rules of the domain.
   - Independent of Fastify HTTP request/reply objects (for testability).
   - Coordinate actions with one or more Repositories.
   - Throw domain errors (`AppError`, `NotFoundError`, `UnauthorizedError`, `ValidationError`) on invariant failure.

3. **Repositories (`*.repository.ts`)**:
   - Isolate Drizzle ORM queries and database access patterns.
   - Convert database entities into domain models.
   - Facilitate unit testing and mocking without real database connections.

4. **DTO Schemas (`*.schema.ts`)**:
   - Define strict Zod validation schemas for inputs (params, query, body) and outputs (responses).
   - Export TypeScript types inferred via `z.infer<typeof ...>`.

## 3. Error Handling

- All operational exceptions must inherit from `AppError` (`src/shared/errors/app-error.ts`).
- All errors are captured centrally by `src/plugins/error-handler.plugin.ts` producing consistent RFC 7807-compliant payloads:
  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Resource not found",
    "details": null
  }
  ```

## 4. Documentation & Agent Planning Artifacts

- All planning artifacts, execution plans, and agent proposals generated in the agent's own brain directory (`~/.gemini/antigravity-cli/brain/**/*.md`) must be saved/mirrored into `docs/agents-plans/`, named `plan-f<n>s<nn>-<slug>.md`, and committed in the sprint's PR.
- Reference repository paths **relative to the repository root**. Absolute paths tied to one machine or user home do not survive a clone and go stale silently.
- Architectural authority — layers, domain contracts, DTO shape, error taxonomy — belongs to the Staff Engineer and is recorded in `docs/specs/**`, the sprint brief and `.agents/memory/DECISIONS.md` (**D-42**). Execution agents plan and implement against those documents; when one is missing or ambiguous, stop and ask instead of inventing a contract.
