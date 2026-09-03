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

- Protected endpoints (such as `/api/playlists`, `/api/favorites`) must verify `request.user` / `request.session` before execution.
- If unauthenticated, throw `UnauthorizedError` (HTTP 401).
- If accessing a resource owned by another user, throw `ForbiddenError` (HTTP 403).

## 4. Security Plugins

- Always load `@fastify/helmet` for secure HTTP headers.
- Configure `@fastify/cors` using allowed origins from `env.CORS_ORIGIN`.
- Apply `@fastify/rate-limit` to prevent brute force attacks on authentication and public routes.
- Use `@fastify/under-pressure` to monitor event loop delay, memory, and heap health.
