# Authentication & Security Rules

Guidelines for user authentication using **Better Auth** and Fastify security plugins.

## 1. Better Auth Integration

- Better Auth configuration resides in `src/modules/auth/auth.config.ts`.
- Uses `drizzleAdapter(db, { provider: 'pg' })`.
- Session expiration is configured for 7 days (`60 * 60 * 24 * 7`).
- Email and password authentication requires minimum 8 characters.

## 2. Fastify Session Decorator

- `src/modules/auth/auth.plugin.ts` intercepts requests and sets `request.session` and `request.user` via Fastify decoration.
- Fastify types are augmented in `src/shared/types/fastify.d.ts` to include `session` and `user` properties on `FastifyRequest`.

## 3. Route Protection

- Protected endpoints (such as `/api/v1/playlists`, `/api/v1/favorites`) must verify `request.user` / `request.session` before execution.
- If unauthenticated, throw `UnauthorizedError` (HTTP 401).
- **If the resource is owned by another user, throw `NotFoundError` (HTTP 404) — never `ForbiddenError` (403).** Per **D-31** and `docs/specs/03-contrato-da-api.md` §7, a resource that does not exist and a resource belonging to someone else must be indistinguishable; a 403 confirms existence and turns UUID enumeration into an information leak. **No MVP route emits 403.** `ForbiddenError` stays in the hierarchy for a future case where the resource is provably visible to the user but the action is not permitted.
- Authenticated ≠ owner. Every route with an `:id` needs an ownership check on the row actually loaded, never inferred from a client-supplied field. Nested resources (`playlist_tracks`, `favorites`) inherit the parent's check.

## 4. Security Plugins

- Always load `@fastify/helmet` for secure HTTP headers.
- Configure `@fastify/cors` using allowed origins from `env.CORS_ORIGIN`.
- Apply `@fastify/rate-limit` to prevent brute force attacks on authentication and public routes.
- Use `@fastify/under-pressure` to monitor event loop delay, memory, and heap health.
