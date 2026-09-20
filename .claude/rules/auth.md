---
paths:
  - 'src/modules/auth/**/*.ts'
  - 'src/shared/types/fastify.d.ts'
---

# Authentication and authorization

> **Overlap.** `.agents/rules/auth.md` covers the same ground and is row 3 of the chain in
> `CLAUDE.md`. `docs/specs/04-autenticacao-seguranca.md` is row 2 and outranks both. Keep one of
> the two rule files; if this one stays, `.agents/rules/auth.md` should be the one to go, not
> silently diverge.
>
> **There is no RBAC in this project.** No roles, no `requireRole`, no admin surface. The filename
> is a leftover; the content below is what the code actually does.

## How it is wired

| File                              | Responsibility                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `src/modules/auth/auth.config.ts` | Better Auth configured once, with `drizzleAdapter(db, { provider: 'pg' })`             |
| `src/modules/auth/auth.plugin.ts` | mounts the handler, decorates the request, exposes the guard                           |
| `src/modules/auth/auth.routes.ts` | the module's own routes                                                                |
| `src/shared/types/fastify.d.ts`   | declares the augmentation for `request.user`, `request.session`, `fastify.requireAuth` |

The plugin calls `decorateRequest('user', null)` and `decorateRequest('session', null)`, resolves
the session per request, and decorates the instance with **one** guard:

```ts
fastify.decorate('requireAuth', async (request: FastifyRequest): Promise<void> => { ... });
```

Apply it as a `preHandler`:

```ts
app.get('/me/playlists', { preHandler: [app.requireAuth], schema: { ... } }, handler);
```

`requireAuth` throws `UnauthorizedError` (401) when there is no valid session. There is no
`optionalAuth` and no `requireRole` — a route that wants an anonymous-friendly read simply omits
the guard and reads `request.user`, which is `null` when unauthenticated.

Any new decorator must be declared in `src/shared/types/fastify.d.ts` in the same PR.

## Routing

Domain routes are versioned under `/api/v1`. Better Auth's own catch-all is mounted at
`/api/auth`, **unversioned** (D-16). Better Auth answers in its own error format, which differs
from the API's RFC 7807 shape — that asymmetry is accepted and intentional. Errors raised by your
own routes go through `AppError` and `error-handler.plugin.ts`, so they stay RFC 7807.

## Authentication is not authorization

`requireAuth` answers "who are you". It does **not** answer "is this yours". Every resource owned
by a user — any table with an FK to the user — needs an ownership check **inside the
service/repository**.

**D-31 is closed: another user's resource is indistinguishable from a missing one — `NotFoundError`
(404), never 403.** Returning 403 confirms the resource exists and leaks the ID space.
`ForbiddenError` exists in the hierarchy but no route emits it; if a draft produces a 403 for an
ownership failure, that draft is wrong.

Filter by owner **in the `WHERE` clause**:

```ts
where(and(eq(playlists.id, id), eq(playlists.userId, userId)));
```

Never fetch by ID and compare after the fact — that shape drifts into an IDOR the first time
someone adds an early return.

The E2E suite carries cross-user isolation cases asserting 404. They are not optional.

## Responses never leak credentials

The route's `response` schema is the last barrier. Never return a raw user entity: no password
hash, no token, no session field, no other user's data. Declare a response schema with exactly the
public fields.

The same holds for logs. `request.log` never receives a token, a session cookie or a secret. D-22
makes Pino `redact` of sensitive headers a baseline, configured in `src/app.ts` — not a feature to
be negotiated per route.

## Configuration

Everything comes from `src/config/env.ts`, which is fail-fast at boot and is the **only** file
allowed to read `process.env` (enforced as a hard ESLint error everywhere else in `src/**`).

- `BETTER_AUTH_SECRET` — required, `min(32)`.
- `BETTER_AUTH_URL` — must match the real public URL. **D-62: it is immutable in practice.** The
  WebAuthn RP ID is bound to the origin, so changing it after launch invalidates every registered
  passkey. This is why the custom domain is configured before the first production deploy.
- `CORS_ORIGIN` — the CORS allow-list. With credentials, never `*`.
- `TRUST_PROXY_HOPS` / `TRUSTED_PROXIES` — how the client IP is derived behind a proxy. Getting
  this wrong makes the rate limiter count every request against the proxy's IP.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` / `RATE_LIMIT_REDIS_URL` — the global limit, distributed
  when a Redis URL is present.
- `GOOGLE_*`, `GITHUB_*`, `FACEBOOK_*` — optional social providers.
- `RESEND_API_KEY` — optional in development, **required in production** by a `superRefine` in the
  schema. `EMAIL_FROM` has a default.

## Enumeration and brute force

Login, registration and recovery responses must not reveal whether an e-mail exists — generic
message either way. The global `@fastify/rate-limit` (`RATE_LIMIT_MAX`, default 100/min) applies to
everything; auth routes deserve a _stricter_ limit, never a looser one.

D-38 exempts `/health*` from the `under-pressure` 503 and from the rate limiter
(`allowList: (req) => req.url.startsWith('/health')`), so probes are never throttled. A test that
tries to prove rate limiting by hammering `/health` is unrunnable by construction — use a real
route.

Security changes in the edge plugins (`cors.plugin.ts`, `helmet.plugin.ts`,
`rate-limit.plugin.ts`) affect the whole API. Never loosen a global to unblock one route.
