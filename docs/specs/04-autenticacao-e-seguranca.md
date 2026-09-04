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

> O bloco acima é o que **F3-S01** entrega. As seções §1.1 e §1.2 **acrescentam chaves a
> esse mesmo objeto** e são entregues por **F3-S03** — não são um segundo `betterAuth()`,
> não são um segundo arquivo.

---

## 1.1 OAuth social — Google, GitHub, Facebook (F3-S03)

```ts
socialProviders: Object.fromEntries(
  SOCIAL_PROVIDERS.map((provider) => [provider, PROVIDER_CONFIG[provider]]),
),
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ['google', 'github'],
  },
},
```

`SOCIAL_PROVIDERS` sai de `src/config/env.ts` e contém **apenas** os provedores cujo par
`*_CLIENT_ID` + `*_CLIENT_SECRET` está presente. Provedor sem credencial não é registrado —
o efeito é um 4xx da lib em vez de um 500 por `clientId: undefined`, e é o que permite
rodar o projeto localmente sem as seis credenciais.

### Rotas resultantes — spec `03` §5

`POST /api/auth/sign-in/social` (R26) · `GET /api/auth/callback/:providerId` (R27).
Ambas montadas pela lib na rota coringa `/api/auth/*` do `auth.plugin.ts`. **Nenhum
handler novo é escrito.**

### Escopos — mínimos, e não mais que isso

| Provedor | Escopo                 | Observação                                            |
| -------- | ---------------------- | ----------------------------------------------------- |
| Google   | `openid email profile` | padrão da lib                                         |
| GitHub   | `user:email`           | **obrigatório**: sem ele, e-mail privado volta `null` |
| Facebook | `email public_profile` | `email` só é liberado após **App Review** da Meta     |

### Redirect URIs

Cadastradas no console de cada provedor, uma por ambiente:

```
http://localhost:3000/api/auth/callback/<provider>
https://<dominio-de-producao>/api/auth/callback/<provider>
```

### Ligação de contas — regra de segurança

`accountLinking` liga automaticamente a conta social ao usuário existente de mesmo e-mail.
Isso só é seguro com provedor que **comprovadamente verifica** o e-mail antes de devolvê-lo.

- **`trustedProviders` contém `google` e `github`.**
- **O Facebook fica fora**, mesmo depois do App Review.
- Provedor em dúvida fica **fora** — o usuário ainda pode ligar a conta manualmente depois
  de autenticado.

Ligar um provedor não confiável permite que alguém crie uma conta social com o e-mail da
vítima e passe a entrar na conta dela. É sequestro de conta, não conveniência.

### Cliente nativo (Flutter) — dois caminhos

| Caminho                  | Como funciona                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **`idToken`** (preferir) | SDK nativo autentica no aparelho; o app envia o `idToken` em `POST /sign-in/social`. Sem redirect, sem deep link, sem browser.  |
| Redirect + deep link     | `POST /sign-in/social` devolve `{ url }`; o app abre no navegador; o retorno cai em `callbackURL`, que precisa ser o deep link. |

`callbackURL` é validado contra `trustedOrigins`, que passa a incluir o deep link:

```ts
trustedOrigins: [...env.CORS_ORIGIN_LIST, env.MOBILE_DEEP_LINK].filter(Boolean),
```

**`callbackURL` aceito sem essa validação é open redirect com token na URL.** Não relaxe.

---

## 1.2 E-mail transacional — Resend (F3-S03)

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  autoSignIn: true,
  requireEmailVerification: false,
  resetPasswordTokenExpiresIn: 60 * 60, // 1 h
  sendResetPassword: async ({ user, url }) => {
    await mailer.send({ to: user.email, ...resetPasswordEmail({ name: user.name, url }) });
  },
},
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  expiresIn: 60 * 60 * 24, // 24 h
  sendVerificationEmail: async ({ user, url }) => {
    await mailer.send({ to: user.email, ...verificationEmail({ name: user.name, url }) });
  },
},
```

### Rotas resultantes — spec `03` §5

`POST /api/auth/send-verification-email` (R28) · `GET /api/auth/verify-email` (R29) ·
`POST /api/auth/forget-password` (R30) · `POST /api/auth/reset-password` (R31).

### `requireEmailVerification: false` é deliberado

`true` faz o `sign-in/email` responder 403 até o clique no link, o que quebra
`signUpAndGetToken` (spec `05` §4) — o helper de que F3-S02, F4-S01, F4-S02 e a suíte E2E
inteira dependem. Verificar e-mail passa a ser requisito quando existir uma feature que
dependa disso; **hoje não existe**. O estado fica visível ao cliente em `emailVerified` do
`GET /api/auth/get-session` (R12).

**`emailVerified` não entra no DTO `Me`** — §7 desta spec proíbe e a spec `03` §3 mantém as
5 chaves.

### Transporte — `src/shared/email/mailer.ts`

Dois transportes, escolhidos **uma vez**, por `env.RESEND_API_KEY` existir ou não:

| Transporte | Quando         | Comportamento                                             |
| ---------- | -------------- | --------------------------------------------------------- |
| `resend`   | chave presente | envia de verdade; **nunca loga a URL** (contém o token)   |
| `memory`   | chave ausente  | empilha em `outbox` e loga `{to, subject, url}` em `info` |

`memory` é o transporte de `test` (é o que torna os fluxos testáveis sem rede) e de
`development` sem conta no Resend. Em `production` a chave é **obrigatória** (§6).

**`mailer.send` nunca rejeita.** O Better Auth chama `sendVerificationEmail` dentro do
fluxo de criação do usuário: propagar erro do provedor derruba o sign-up inteiro quando o
Resend estiver fora do ar. Falha vira log `warn`; o usuário pede reenvio em R28.

### Não vazar quais e-mails existem

`POST /forget-password` e `POST /send-verification-email` respondem **200 idêntico** para
e-mail existente e inexistente. A diferença é só que, no segundo caso, nenhum e-mail sai.
Resposta diferenciada transforma a rota em oráculo de enumeração de contas.

### Rate limit dedicado

Estas rotas mandam e-mail e testam senha; o limite global de 10/min é frouxo para elas:

```ts
rateLimit: {
  enabled: env.NODE_ENV === 'production', // D-19, inalterado
  window: 60,
  max: 10,
  customRules: {
    '/forget-password':         { window: 3600, max: 3 },
    '/send-verification-email': { window: 3600, max: 3 },
    '/reset-password':          { window: 3600, max: 5 },
    '/sign-in/social':          { window: 60,   max: 10 },
  },
},
```

- As chaves são **relativas ao `basePath`** (`/forget-password`, não
  `/api/auth/forget-password`). Escritas errado, a regra não casa e falha em silêncio — o
  limite global assume o lugar dela.
- `enabled` continua preso a produção (**D-19**), `customRules` inclusive.

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

### Acrescentadas por F3-S03 — §1.1 e §1.2

| Variável                 | Tipo Zod                     | Default                                 | Obrigatória           |
| ------------------------ | ---------------------------- | --------------------------------------- | --------------------- |
| `GOOGLE_CLIENT_ID`       | `string().min(1).optional()` | —                                       | par, ver abaixo       |
| `GOOGLE_CLIENT_SECRET`   | `string().min(1).optional()` | —                                       | par                   |
| `GITHUB_CLIENT_ID`       | `string().min(1).optional()` | —                                       | par                   |
| `GITHUB_CLIENT_SECRET`   | `string().min(1).optional()` | —                                       | par                   |
| `FACEBOOK_CLIENT_ID`     | `string().min(1).optional()` | —                                       | par                   |
| `FACEBOOK_CLIENT_SECRET` | `string().min(1).optional()` | —                                       | par                   |
| `RESEND_API_KEY`         | `string().startsWith('re_')` | —                                       | **sim em production** |
| `EMAIL_FROM`             | `string().min(1)`            | `Cardoso Sound <onboarding@resend.dev>` | não                   |
| `MOBILE_DEEP_LINK`       | `string().optional()`        | —                                       | não                   |

- **"par"** significa: ou as duas do provedor estão presentes, ou nenhuma. Só `CLIENT_ID`
  sem `CLIENT_SECRET` é erro de validação, não provedor meio-configurado.
- Derivado exportado: `SOCIAL_PROVIDERS: ('google'|'github'|'facebook')[]` — só os
  provedores com o par completo. É ele que alimenta `socialProviders` em §1.1.
- `RESEND_API_KEY` ausente fora de `production` é **legítimo**: cai no transporte de
  memória (§1.2). Em `production`, ausente **derruba o processo**, como `BETTER_AUTH_SECRET`.
- `EMAIL_FROM` com o domínio padrão do Resend só entrega ao dono da conta. Produção exige
  domínio verificado (SPF + DKIM).
- `MOBILE_DEEP_LINK` entra em `trustedOrigins` (§1.1). Vazio = só o fluxo `idToken` funciona
  no app.

### Regras que valem para todas

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
- [ ] `customRules` do Better Auth ativas em produção; caminhos relativos ao `basePath` (§1.2)
- [ ] `forget-password` responde **igual** para e-mail existente e inexistente
- [ ] Nenhum token de verificação ou reset em log com o transporte `resend` (§1.2)
- [ ] `trustedProviders` do `accountLinking` só com provedor que verifica e-mail (§1.1)
- [ ] `callbackURL` validado contra `trustedOrigins` — sem open redirect (§1.1)
- [ ] Nenhum `*_CLIENT_SECRET` nem `RESEND_API_KEY` no repositório ou no histórico
- [ ] `helmet` ativo; headers conferidos com `curl -I`
- [ ] Nenhum `any` e nenhum `@ts-expect-error` sem justificativa em comentário
- [ ] `pnpm audit --prod` sem vulnerabilidade alta ou crítica
