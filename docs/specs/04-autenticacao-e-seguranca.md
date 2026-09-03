# 04 — Autenticação e Segurança

---

## 1. Better Auth — configuração única

`src/modules/auth/auth.config.ts` é o **único** lugar que configura autenticação.

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { env } from '../../config/env.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: env.NODE_ENV === 'production', window: 60, max: 10 },
  trustedOrigins: env.CORS_ORIGIN_LIST,
  plugins: [bearer()],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
```

Pontos que não são negociáveis:

- **`plugins: [bearer()]`** — é o que faz a API aceitar `Authorization: Bearer <token>`
  e devolver o header `set-auth-token` no sign-in/sign-up. Sem isso o Flutter não
  autentica (**D-13**). O cookie httpOnly continua funcionando em paralelo.
- **`basePath: '/api/auth'`** — não versionado, padrão da lib (**D-16**).
- **`rateLimit` só em produção** — em dev/test ligado ele derruba a suíte com 429
  espúrios (**D-19**).
- Os tipos `Session` e `User` saem de `auth.$Infer` — **nunca** escritos à mão.

---

## 2. Plugin Fastify

`src/modules/auth/auth.plugin.ts`, registrado com `fastify-plugin` (precisa vazar os
decorators para o escopo global).

Responsabilidades, nesta ordem:

1. **Montar o handler.** Uma rota coringa `/api/auth/*` (GET, POST, OPTIONS) que converte
   `FastifyRequest` em `Request` do Fetch API e devolve o resultado de `auth.handler(req)`.
   - Converter headers com `new Headers()`, montar a URL absoluta a partir de
     `env.BETTER_AUTH_URL` + `request.url`, e repassar o body como string.
   - Copiar de volta **status, headers e body**. Cuidado especial com `set-cookie`
     (pode vir múltiplo — use `reply.header()` acumulando, não sobrescrevendo) e com
     `set-auth-token`.
   - Desabilitar a validação Zod nessa rota: o corpo é da lib, não nosso.
2. **Decorar.** `fastify.decorateRequest('user', null)` e
   `fastify.decorateRequest('session', null)` — declarados uma vez, com `null` inicial.
3. **Hook `onRequest`.** Resolve a sessão em toda requisição:
   ```ts
   const result = await auth.api.getSession({ headers: toHeaders(request.headers) });
   request.user = result?.user ?? null;
   request.session = result?.session ?? null;
   ```
   O hook **nunca lança**. Sessão ausente ou inválida = `null`. Quem decide se isso é
   erro é o guard da rota.
4. **Expor o guard.** `fastify.decorate('requireAuth', preHandler)`.

### Augmentation de tipos

`src/shared/types/fastify.d.ts`:

```ts
import 'fastify';
import type { Session, User } from '../../modules/auth/auth.config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    session: Session | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
```

---

## 3. Guard de rotas

```ts
// preHandler global exposto pelo auth.plugin
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.user || !request.session) {
    throw new UnauthorizedError('Authentication required');
  }
}
```

Uso em rota protegida:

```ts
fastify.get(
  '/playlists',
  {
    onRequest: [fastify.requireAuth],
    schema: {/* … */},
  },
  handler,
);
```

### Contrato de identidade dentro do handler

Depois do guard, `request.user` é **não-nulo**. Passe **apenas `request.user.id`** ao
service — nunca o objeto `request` inteiro, nunca `reply`. É isso que mantém o service
testável (spec `01`, seção 1).

```ts
// ✅
return service.listPlaylists(request.user!.id, request.query);
// ❌
return service.listPlaylists(request);
```

### Autorização de recurso

Todo recurso de usuário é filtrado por `user_id` **na query**, não em memória:

```ts
// ✅ o banco garante o isolamento
.where(and(eq(playlists.id, id), eq(playlists.userId, userId)))

// ❌ busca tudo e compara depois — vaza em log, em erro e em race
const p = await repo.findById(id); if (p.userId !== userId) throw ...
```

Resultado vazio → `NotFoundError` (404). **Nenhuma rota do MVP emite 403** — ver spec
`03`, seção 7. `ForbiddenError` existe na hierarquia para uso futuro.

---

## 4. Plugins de defesa

Registrados em `src/app.ts` na ordem: helmet → cors → rate-limit → under-pressure.

### `helmet.plugin.ts`

```ts
await fastify.register(helmet, {
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
});
```

> CSP desligado fora de produção porque quebra o Swagger UI. Em produção o CSP padrão
> vale, e `/docs` é aceitável ficar restrito.

### `cors.plugin.ts` — **D-19**

```ts
await fastify.register(cors, {
  origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN_LIST : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['set-auth-token'],
});
```

> `exposedHeaders: ['set-auth-token']` é obrigatório — sem ele um cliente browser não
> consegue ler o token. App Flutter nativo **não envia `Origin`**, então CORS não o afeta;
> isso protege apenas Swagger UI e um eventual front web.

### `rate-limit.plugin.ts` — **D-19**

```ts
await fastify.register(rateLimit, {
  global: env.NODE_ENV === 'production',
  max: env.RATE_LIMIT_MAX, // 100
  timeWindow: env.RATE_LIMIT_WINDOW, // '1 minute'
  allowList: (req) => req.url.startsWith('/health'),
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

> Desligado fora de produção — 429 esporádico em teste é a fonte clássica de flake.
> As rotas `/api/auth/*` têm o rate limit **próprio** do Better Auth (10/60s), também
> só em produção.

### `under-pressure.plugin.ts` — **D-26**

```ts
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 512 * 1024 * 1024,
  maxRssBytes: 640 * 1024 * 1024,
  retryAfter: 50,
  healthCheck: async () => {
    await pool.query('SELECT 1');
    return true;
  },
  healthCheckInterval: 5000,
  exposeStatusRoute: false,
});
```

> `exposeStatusRoute: false` porque `/health/ready` já é a rota pública de readiness e
> usa o **mesmo** `SELECT 1`. Uma checagem, dois consumidores.

---

## 5. Logging seguro — baseline não-negociável

Repositório público + API pública. Um `request.log.error` num erro de auth despeja
`Authorization: Bearer <token>` no stdout do Railway. Configuração do Pino em `app.ts`:

```ts
const logger = {
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'res.headers["set-auth-token"]',
      '*.password',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
};
```

- `pino-pretty` **só** em desenvolvimento; JSON puro em test e production (**D-18**).
- `LOG_LEVEL` vem do env: `info` em prod, `debug` em dev, `silent` em test.
- **`console.*` é erro de lint** em `src/**`.

---

## 6. Variáveis de ambiente

`src/config/env.ts` — validação Zod 4, executada uma vez no import. Falha de validação
imprime as issues e chama `process.exit(1)` **antes** do servidor subir.

| Variável             | Tipo Zod                                                         | Default                 | Obrigatória |
| -------------------- | ---------------------------------------------------------------- | ----------------------- | ----------- |
| `NODE_ENV`           | `enum(['development','test','production'])`                      | `development`           | não         |
| `PORT`               | `coerce.number().int().positive()`                               | `3000`                  | não         |
| `HOST`               | `string()`                                                       | `0.0.0.0`               | não         |
| `DATABASE_URL`       | `string().url()`                                                 | —                       | **sim**     |
| `BETTER_AUTH_SECRET` | `string().min(32)`                                               | —                       | **sim**     |
| `BETTER_AUTH_URL`    | `string().url()`                                                 | `http://localhost:3000` | não         |
| `CORS_ORIGIN`        | `string()` (CSV)                                                 | `""`                    | não         |
| `LOG_LEVEL`          | `enum(['fatal','error','warn','info','debug','trace','silent'])` | `info`                  | não         |
| `RATE_LIMIT_MAX`     | `coerce.number().int().positive()`                               | `100`                   | não         |
| `RATE_LIMIT_WINDOW`  | `string()`                                                       | `1 minute`              | não         |

- Derivado exportado: `CORS_ORIGIN_LIST: string[]` (split por vírgula, trim, sem vazios).
- Em `production`, `BETTER_AUTH_SECRET` com menos de 32 chars **derruba o processo**.
- **Nenhum arquivo fora de `src/config/env.ts` lê `process.env`.** Isso é regra de lint.
- `.env` está no `.gitignore`. `.env.example` é commitado, documentado e **sem valores reais**.

### Segredos em produção

Vivem em **Railway Variables** e em **GitHub Secrets** (`RAILWAY_TOKEN`). Nunca no repo,
nunca em `mcp_config.json`, nunca em fixture de teste. O `.agents/mcp_config.json` do
scaffold contém placeholders (`seu_token_github_aqui`) — eles **permanecem placeholders**
no repositório público.

---

## 7. Checklist de auditoria de segurança (F5-S03)

- [ ] `.env` fora do git; `git log -p` não contém segredo em nenhum commit
- [ ] `mcp_config.json` sem token real
- [ ] Response schema de `/me` não expõe `password`, `emailVerified`, `session`, `account`
- [ ] Erro 500 nunca devolve `stack` nem `err.message` cru ao cliente
- [ ] `redact` do Pino cobre `authorization`, `cookie`, `set-cookie`, `set-auth-token`
- [ ] Toda rota protegida tem `onRequest: [fastify.requireAuth]` — conferir uma a uma
- [ ] Todo acesso a recurso de usuário filtra por `user_id` **na query SQL**
- [ ] Rate limit e CORS restritos com `NODE_ENV=production`
- [ ] `helmet` ativo; headers conferidos com `curl -I`
- [ ] Nenhum `any` e nenhum `@ts-expect-error` sem justificativa em comentário
- [ ] `pnpm audit --prod` sem vulnerabilidade alta ou crítica
