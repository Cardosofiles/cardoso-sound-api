# Plano de Implementação — Sprint F3-S01: Better Auth (Configuração, Plugin e Guards)

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F3 — Identidade · **Primeiro sprint da fase F3**  
> **Branch Alvo:** `feature/f3s01-better-auth` (a partir de `develop`)  
> **Depende de:** F2-S04 (Conclusão do Catálogo `tracks`, release e tag `v0.2.0`)  
> **Contratos de Entrega:** R09 (`POST /api/auth/sign-up/email`), R10 (`POST /api/auth/sign-in/email`), R11 (`POST /api/auth/sign-out`), R12 (`GET /api/auth/get-session`), decorators `request.user` / `request.session`, guard reutilizável `fastify.requireAuth`  
> **Specs de Referência:**
>
> - [`docs/specs/04-autenticacao-e-seguranca.md`](../specs/04-autenticacao-e-seguranca.md) (§1 — Better Auth, §2 — Plugin Fastify, §3 — Guard de rotas, §5 — Logging seguro)
> - [`docs/specs/03-contrato-da-api.md`](../specs/03-contrato-da-api.md) (§5 — Autenticação R09 a R12)
> - [`docs/specs/05-testes-e-qualidade.md`](../specs/05-testes-e-qualidade.md) (§4 — Helper `signUpAndGetToken`)
> - [`docs/specs/07-protocolo-dos-agentes.md`](../specs/07-protocolo-dos-agentes.md)
> - [`docs/sprints/fase-3-identidade/F3-S01-better-auth.md`](../sprints/fase-3-identidade/F3-S01-better-auth.md)
> - [`.agents/memory/DECISIONS.md`](../../.agents/memory/DECISIONS.md) (**D-01**, **D-04**, **D-13**, **D-16**, **D-18**, **D-19**, **D-22**, **D-31**, **D-36**, **D-40**, **D-42**)
> - [`.agents/memory/F1-S06.md`](../../.agents/memory/F1-S06.md) (Ordem canônica de plugins em `src/app.ts`)

---

## 0. Realinhamento com `develop` (2026-09-05)

Este plano foi escrito antes do merge do PR #21 (`8d1e7c5`) e precisou de dois ajustes.
Nenhum deles altera a engenharia proposta — só a numeração e os caminhos.

### 0.1 Os ADRs desta sprint passam a ser D-43, D-44 e D-45

O PR #21 registrou **D-42 · Claude Code (Opus 5) é o Staff Engineer; Antigravity executa**.
Como este plano reservava D-42, D-43 e D-44, os três deslocam em um:

| Decisão desta sprint                                                     | Era  | **É agora** |
| :----------------------------------------------------------------------- | :--- | :---------- |
| Ponte artesanal Fastify ↔ Fetch API para o handler do Better Auth        | D-42 | **D-43**    |
| Repasse de múltiplos `Set-Cookie` via `Headers.prototype.getSetCookie()` | D-43 | **D-44**    |
| `auth.routes.ts` como `export {}` — Opção A, por boundaries do ESLint    | D-44 | **D-45**    |

Confira `.agents/memory/DECISIONS.md` na Etapa 1 antes de escrever: se outro sprint tiver
consumido números no intervalo, **desloque de novo** em vez de sobrescrever.

### 0.2 O que mais mudou em `develop` e afeta esta sprint

- **D-31 é vinculante para o guard.** `.agents/rules/auth.md` prescrevia `ForbiddenError`
  (403) para recurso de outro usuário e foi corrigido: a resposta é **404, nunca 403**.
  `requireAuth` continua lançando `UnauthorizedError` (401) para anônimos — isso não muda —
  mas nenhuma rota que você criar pode emitir 403.
- **Regra 6 agora exige caminhos relativos à raiz do repositório.** Os links deste plano
  foram convertidos de `file:///home/...` para relativos; mantenha assim.
- **A porta padrão é 3333**, não 3000. `env.BETTER_AUTH_URL` já resolve isso — não fixe porta.
- **Autoridade de contrato.** Por D-42, buraco ou ambiguidade no sprint brief é defeito do
  Staff: **pare e reporte** (Parada 1), não preencha com desenho próprio.

---

## 1. Contexto e Objetivos Técnicos

A sprint **F3-S01** inaugura a **Fase 3 (Identidade)** e é historicamente classificada como a **sprint de maior risco arquitetural do projeto**. Como o framework web é o **Fastify v5** e a biblioteca de autenticação é o **Better Auth v1.7.2** (construída primordialmente sobre as abstrações de `Request` e `Response` da Web Fetch API padrão), inexiste adaptador nativo mantido oficialmente pelo ecossistema Fastify.

A integração exige a engenharia cirúrgica de uma ponte artesanal bidirecional entre `FastifyRequest`/`FastifyReply` e `Request`/`Response`, garantindo interoperabilidade total para os dois clientes alvo do produto (**D-13**):

1. **Cliente Mobile Nativo (Flutter):** Autentica através de cabeçalhos HTTP `Authorization: Bearer <token>` armazenados em `flutter_secure_storage` e obtidos a partir do header de resposta `set-auth-token`.
2. **Cliente Navegador / Documentação (Swagger UI / Front):** Autentica por cookies `HttpOnly` (`better-auth.session_token`).

### Objetivos Centrais:

1. **Configuração Canônica do Better Auth (`src/modules/auth/auth.config.ts`):**
   - Instanciar `betterAuth()` acoplado ao PostgreSQL através de `drizzleAdapter(db, { provider: 'pg', schema })`.
   - Ativar suporte simultâneo a tokens de autorização e cookies via `plugins: [bearer()]`.
   - Configurar `rateLimit` ativo **exclusivamente em produção** (`isProduction`), eliminando falsos positivos e código 429 espúrio na suíte de testes (**D-19**).
   - Validar origens confiáveis através de `trustedOrigins: env.CORS_ORIGIN_LIST`.
   - Exportar os tipos utilitários inferidos `Session` e `User` a partir de `typeof auth.$Infer.Session`.

2. **Engenharia da Ponte Fetch ↔ Fastify (`src/modules/auth/auth.plugin.ts`):**
   - Montar rota curinga Fastify `['GET', 'POST', 'OPTIONS'] /api/auth/*` sem validação Zod (`schema: { hide: true }`), delegando o fluxo ao handler interno `auth.handler(req)`.
   - Construir o objeto Fetch `Request` com URL absoluta derivada de `env.BETTER_AUTH_URL`, repassando headers de entrada e corpo serializado.
   - Preservar integridade de cabeçalhos de resposta, com **tratamento especializado para múltiplos headers `Set-Cookie`** através de `Headers.prototype.getSetCookie()`, evitando o colapso clássico de múltiplos cookies em uma única string corrompida.
   - Repassar o header `set-auth-token` e manter o `content-type` original emitido pela biblioteca.

3. **Decorators Globais e Resolução Passiva de Sessão:**
   - Decorar requisições Fastify com `fastify.decorateRequest('user', null)` e `fastify.decorateRequest('session', null)`.
   - Implementar hook global Fastify `onRequest` que resolve a sessão em toda requisição via `auth.api.getSession({ headers: toFetchHeaders(request.headers) })`.
   - **Garantia de Não-Interrupção:** O hook `onRequest` roda em bloco protegido (`try/catch`) e **nunca lança exceções**. Rotas públicas e não autenticadas mantêm `request.user === null` sem interrupção de fluxo.

4. **Guard Reutilizável de Rotas (`fastify.requireAuth`):**
   - Decorar a instância Fastify com `fastify.decorate('requireAuth', preHandler)` compatível com hooks `onRequest` e `preHandler`.
   - Interromper requisições anônimas lançando `new UnauthorizedError('Authentication required')`, interceptado pelo `errorHandlerPlugin` para geração do envelope RFC 7807 (HTTP 401).

5. **Helper E2E Reutilizável (`tests/e2e/helpers/auth.ts`):**
   - Fornecer função `signUpAndGetToken(app, email?)` que registra um usuário temporário e extrai `{ token, userId }` via header `set-auth-token`, servindo de fundação mandatória para os testes das sprints F3-S02, F4-S01, F4-S02 e F4-S03.

---

## 2. Diagnóstico Técnico Preliminar e Resolução de Divergência de Schema (Seção 5.1 do Sprint)

A seção 5.1 do documento de sprint determina formalmente:

> _"pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts_  
> _Compare com o que F2-S01 escreveu à mão. **Divergiu → pare e reporte.** Prosseguir com schema errado gera erro obscuro de adapter em runtime, difícil de rastrear._  
> _Se `users.schema.ts` precisar mudar, isso **exige uma migração nova** (`0001_*.sql`)."_

### Análise Forense do Schema em Runtime:

Durante a fase de pesquisa técnica, foi executada a validação da tabela `account` gerada no Better Auth v1.7.2 contra o schema construído manualmente em F2-S01 (`src/db/schema/users.schema.ts`):

```bash
# Execução de teste preliminar contra adapter Drizzle:
Sign up failed: [BetterAuthError: The field "issuer" does not exist in the "account" Drizzle schema. Please update your drizzle schema or re-generate using "npx auth@latest generate".]
```

#### Causa Raiz:

No Better Auth v1.7.2, a entidade `account` passou a incluir obrigatoriamente a coluna `issuer` (`string`, preenchida com o valor `"credential"` por `createLocalAccountIssuer("credential")` no cadastro de e-mail e senha). O `@better-auth/drizzle-adapter` inspeciona as chaves do schema Drizzle (`schemaModel[field]`) e rejeita qualquer operação caso o campo não esteja mapeado na definição TypeScript da tabela.

#### Comparação Campo a Campo:

| Tabela / Campo                        | `users.schema.ts` (F2-S01)                                                     | Better Auth v1.7.2 (`getAuthTables`) | Divergência? | Ação Necessária                                 |
| :------------------------------------ | :----------------------------------------------------------------------------- | :----------------------------------- | :----------: | :---------------------------------------------- |
| **`user`** (todas as colunas)         | `id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`   | idêntico                             |    🟢 Não    | Nenhuma                                         |
| **`session`** (todas as colunas)      | `id`, `token`, `expires_at`, `ip_address`, `user_agent`, `user_id`, timestamps | idêntico                             |    🟢 Não    | Nenhuma                                         |
| **`verification`** (todas as colunas) | `id`, `identifier`, `value`, `expires_at`, timestamps                          | idêntico                             |    🟢 Não    | Nenhuma                                         |
| **`account.issuer`**                  | **Ausente**                                                                    | `issuer: text` (obrigatório)         |  🔴 **SIM**  | **Adicionar coluna com default `'credential'`** |
| **`account`** (demais colunas)        | `id`, `account_id`, `provider_id`, `user_id`, `password`, tokens, timestamps   | idêntico                             |    🟢 Não    | Nenhuma                                         |

### Resolução de Engenharia Proposta:

1. **Atualizar `src/db/schema/users.schema.ts`:**
   Acrescentar o campo `issuer: text('issuer').notNull().default('credential')` na tabela `account`. O valor default `'credential'` garante compatibilidade regressiva imediata para quaisquer registros existentes.
2. **Gerar a migração `drizzle/0001_add_issuer_to_account.sql`:**
   Utilizar `drizzle-kit generate` para produzir a migração de schema com a instrução canônica:
   ```sql
   ALTER TABLE "account" ADD COLUMN "issuer" text DEFAULT 'credential' NOT NULL;
   ```
3. **Compatibilidade Automática em Testcontainers:**
   Como `tests/setup/testcontainers.ts` executa `await migrate(db, { migrationsFolder: './drizzle' })`, todas as suítes de teste de integração aplicarão a nova migração automaticamente sem necessidade de mocks manuais.

---

## 3. Decisão de Arquitetura: `auth.routes.ts` e Regras de Boundaries (§5.5 do Sprint)

O sprint §5.5 oferece duas opções para `src/modules/auth/auth.routes.ts`:

- **Opção (a):** Deixar um comentário explicando que as rotas vivem em `auth.plugin.ts`, mantendo `export {};`.
- **Opção (b):** Mover a rota curinga `/api/auth/*` para `auth.routes.ts` e importá-la em `auth.plugin.ts`.

### Análise de Acoplamento e Regras ESLint (`eslint-plugin-boundaries`):

O arquivo `eslint.config.mjs` categoriza os módulos do diretório `src/`:

- `src/modules/auth/*.plugin.ts` -> elemento `type: 'plugin'`.
- `src/modules/*/*.routes.ts` -> elemento `type: 'routes'`.
- Regra de dependência para plugins:
  ```js
  { from: 'plugin', allow: ['shared', 'config', 'dto', 'db'] }
  ```

Como `plugin` **não tem permissão de importar `routes`**, adotar a Opção (b) resultaria em violação imediata de boundaries (`from: 'plugin' to: 'routes' is disallowed`), forçando uma alteração em `eslint.config.mjs` — que está expressamente **fora do blast radius** da sprint.

### Decisão Técnica Adotada (Opção A):

- A rota curinga `/api/auth/*` e a ponte Fastify↔Fetch são montadas diretamente no corpo de `src/modules/auth/auth.plugin.ts`.
- `src/modules/auth/auth.routes.ts` é mantido como documentação canônica de rotas com `export {};`, registrando a razão arquitetural.
- Essa decisão será formalizada em `.agents/memory/DECISIONS.md` como **D-45**.

---

## 4. Blast Radius e Controle Estrito de Arquivos

Em estrita conformidade com a seção 4 de [`docs/sprints/fase-3-identidade/F3-S01-better-auth.md`](../sprints/fase-3-identidade/F3-S01-better-auth.md):

```
Blast Radius Autorizado:
├── Preencher (atualmente com 0 bytes):
│   ├── src/modules/auth/auth.config.ts
│   ├── src/modules/auth/auth.plugin.ts
│   ├── src/modules/auth/auth.routes.ts
│   └── src/shared/types/fastify.d.ts
│
├── Criar:
│   ├── drizzle/0001_*.sql (migração gerada para a divergência confirmada de account.issuer)
│   ├── tests/integration/auth.test.ts
│   ├── tests/e2e/helpers/auth.ts
│   └── docs/agents-plans/plan-f3-s01-better-auth.md (este plano persistido)
│
└── Editar:
    ├── src/app.ts (registro de authPlugin imediatamente antes das rotas de domínio)
    ├── src/db/schema/users.schema.ts (adição de account.issuer)
    ├── .agents/memory/DECISIONS.md (registro de D-43, D-44, D-45)
    ├── .agents/memory/PROGRESS.md
    └── .agents/memory/F3-S01.md
```

### Arquivos Estritamente Intocáveis nesta Sprint:

- `src/modules/{artists,tracks,users,playlists,favorites}/**`
- `src/plugins/**`
- `src/db/client.ts`
- `eslint.config.mjs` e `tsconfig.json`

---

## 5. Especificação Detalhada das Implementações

### 5.1 Configuração Central do Better Auth (`src/modules/auth/auth.config.ts`)

Configuração normativa única conforme spec `04` §1:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { env, isProduction } from '../../config/env.js';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias (em segundos)
    updateAge: 60 * 60 * 24, // Atualiza a cada 24 horas
  },
  rateLimit: {
    enabled: isProduction, // D-19: Desligado em test/development para eliminar flakes
    window: 60,
    max: 10,
  },
  trustedOrigins: env.CORS_ORIGIN_LIST,
  plugins: [bearer()],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
```

---

### 5.2 Augmentation de Tipos do Fastify (`src/shared/types/fastify.d.ts`)

Mapeamento de tipos no namespace Fastify, preservando `import 'fastify';` para tratamento como módulo ESM:

```typescript
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

### 5.3 Plugin de Integração Fastify ↔ Fetch (`src/modules/auth/auth.plugin.ts`)

Implementação encapsulada registrada via `fastify-plugin`, contendo o handler curinga, decorators de requisição, hook passivo `onRequest` e o guard `requireAuth`:

```typescript
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/unauthorized.error.js';
import { auth } from './auth.config.js';

/**
 * Converte o objeto IncomingHttpHeaders do Fastify para o padrão Headers da Fetch API.
 */
export function toFetchHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

const authPluginAsync: FastifyPluginAsync = async (fastify) => {
  // 1. Decorators de requisição inicializados estritamente com null (não compartilhados)
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('session', null);

  // 2. Rota curinga que recebe todas as requisições sob /api/auth/*
  fastify.route({
    method: ['GET', 'POST', 'OPTIONS'],
    url: '/api/auth/*',
    schema: { hide: true }, // Desabilita serialização/validação Zod (payload pertence ao Better Auth)
    async handler(request, reply) {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const headers = toFetchHeaders(request.headers);

      const req = new Request(url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const res = await auth.handler(req);

      reply.status(res.status);

      // Tratamento obrigatório para múltiplos Set-Cookie (D-44 / Armadilha 1)
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length > 0) {
        void reply.header('set-cookie', setCookies);
      }

      // Repasse dos demais headers de resposta, excluindo set-cookie já repassado acima
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') {
          void reply.header(key, value);
        }
      });

      const bodyText = await res.text();
      return reply.send(bodyText || null);
    },
  });

  // 3. Hook global onRequest para resolução passiva de sessão (nunca lança erro)
  fastify.addHook('onRequest', async (request) => {
    try {
      const result = await auth.api.getSession({
        headers: toFetchHeaders(request.headers),
      });

      request.user = result?.user ?? null;
      request.session = result?.session ?? null;
    } catch {
      request.user = null;
      request.session = null;
    }
  });

  // 4. Decorator de guard de rotas para autorização em endpoints protegidos
  fastify.decorate('requireAuth', async (request: FastifyRequest): Promise<void> => {
    if (!request.user || !request.session) {
      throw new UnauthorizedError('Authentication required');
    }
  });
};

export const authPlugin = fp(authPluginAsync, {
  name: 'auth-plugin',
  fastify: '5.x',
});
```

---

### 5.4 Reexport e Documentação (`src/modules/auth/auth.routes.ts`)

```typescript
/**
 * As rotas de autenticação do Better Auth (/api/auth/*) são montadas e gerenciadas
 * diretamente pelo auth.plugin.ts através da rota curinga e do adaptador Fetch API.
 *
 * Conforme Decisão D-45 e regras de isolamento de boundaries do eslint-plugin-boundaries,
 * este arquivo preserva a convenção estrutural de módulos sem exportar rotas redundantes.
 */
export {};
```

---

### 5.5 Integração no App Factory (`src/app.ts`)

O `authPlugin` deve ser registrado imediatamente após o `healthPlugin` e antes de qualquer rota de domínio (`/api/v1/*`):

```typescript
// Trecho a ser adicionado em src/app.ts:
import { authPlugin } from './modules/auth/auth.plugin.js';

// ...
// 4. Rotas de monitoramento de saúde (liveness e readiness)
await app.register(healthPlugin);

// 5. Plugin de autenticação, decorators de sessão e guard global
await app.register(authPlugin);

// 6. Rotas de catálogo e domínio (/api/v1)
await app.register(artistsRoutes, { prefix: API_PREFIX });
await app.register(tracksRoutes, { prefix: API_PREFIX });
```

---

### 5.6 Helper de E2E (`tests/e2e/helpers/auth.ts`)

Helper canônico exigido por `docs/specs/05-testes-e-qualidade.md` §4:

```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export interface SignUpAndGetTokenResult {
  token: string;
  userId: string;
}

/**
 * Cria um usuário de teste único via POST /api/auth/sign-up/email e extrai o Bearer token.
 * Utilizado para viabilizar testes E2E e de integração em rotas autenticadas.
 */
export async function signUpAndGetToken(
  app: FastifyInstance,
  email?: string,
): Promise<SignUpAndGetTokenResult> {
  const userEmail = email ?? `test-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'Password123!';

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json' },
    payload: {
      name: 'E2E Test User',
      email: userEmail,
      password,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(
      `Falha ao criar usuário de teste no signUpAndGetToken: HTTP ${String(res.statusCode)} - ${res.body}`,
    );
  }

  const tokenHeader = res.headers['set-auth-token'];
  const token =
    typeof tokenHeader === 'string' ? tokenHeader : (res.json<{ token?: string }>().token ?? '');

  const payload = res.json<{ user: { id: string } }>();
  const userId = payload.user.id;

  if (!token || !userId) {
    throw new Error(
      'signUpAndGetToken não conseguiu extrair token ou userId da resposta do Better Auth',
    );
  }

  return { token, userId };
}
```

---

## 6. Matriz de Casos de Teste Obrigatórios (`tests/integration/auth.test.ts`)

A suíte de integração utiliza o harness real de banco de dados (`startTestDatabase`, `truncateAll`), `buildApp()` e `app.inject()`.

| #       | Caso de Teste                                       | Descrição da Requisição                                                            | Comportamento Esperado                                                                     |
| :------ | :-------------------------------------------------- | :--------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| **T1**  | Sign-up válido                                      | `POST /api/auth/sign-up/email` com `{ name, email, password }` válido (>= 8 chars) | HTTP 200, corpo contendo `user.id`, `user.email` correto, `user.name`                      |
| **T2**  | Header `set-auth-token` no sign-up                  | Inspecionar headers da resposta de T1                                              | Header `set-auth-token` presente, tipo string e não vazio                                  |
| **T3**  | Header `Set-Cookie` de sessão no sign-up            | Inspecionar headers da resposta de T1                                              | Header `set-cookie` presente e contendo `better-auth.session_token=`                       |
| **T4**  | Senha fraca (< 8 caracteres)                        | `POST /api/auth/sign-up/email` com senha `"12345"`                                 | HTTP 400 (`PASSWORD_TOO_SHORT`), nenhum usuário persistido no PostgreSQL                   |
| **T5**  | Múltiplos cookies repassados integralmente          | Validar `set-cookie` no retorno de sign-up/sign-in                                 | `res.headers['set-cookie']` é array ou string com cookies íntegros                         |
| **T6**  | E-mail duplicado                                    | Duas requisições sequenciais `POST /api/auth/sign-up/email` com mesmo e-mail       | HTTP 422 (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`), tabela `user` contém apenas 1 registro |
| **T7**  | Sign-in com credenciais válidas                     | `POST /api/auth/sign-in/email` com e-mail cadastrado e senha correta               | HTTP 200, token retornado em `set-auth-token`, payload com `user`                          |
| **T8**  | Sign-in com senha inválida                          | `POST /api/auth/sign-in/email` com senha incorreta                                 | HTTP 401 (`INVALID_EMAIL_OR_PASSWORD`)                                                     |
| **T9**  | `GET /get-session` via Bearer token                 | `GET /api/auth/get-session` com `Authorization: Bearer <token>`                    | HTTP 200, `{ session, user }` não-nulos com e-mail do usuário correspondente               |
| **T10** | `GET /get-session` via Cookie de sessão             | `GET /api/auth/get-session` com `Cookie: better-auth.session_token=<signedToken>`  | HTTP 200, `{ session, user }` não-nulos — **prova cabal de D-13**                          |
| **T11** | `GET /get-session` sem credenciais                  | `GET /api/auth/get-session` sem header `authorization` ou `cookie`                 | HTTP 200 com corpo `null` (comportamento nativo documentado da lib)                        |
| **T12** | `request.user` populado em rota de teste com Bearer | Rota de teste `GET /test-auth-me` com `Authorization: Bearer <token>`              | HTTP 200, handler lê `request.user.id` com sucesso                                         |
| **T13** | `request.user === null` sem credencial              | Rota de teste `GET /test-auth-me` sem credenciais                                  | HTTP 200, handler lê `request.user === null`, **sem lançar erro**                          |
| **T14** | `requireAuth` sem credencial                        | Rota protegida `GET /test-protected` (`onRequest: [app.requireAuth]`)              | HTTP 401 com envelope RFC 7807 (`detail: "Authentication required"`)                       |
| **T15** | `requireAuth` com Bearer inválido/expirado          | Rota protegida `GET /test-protected` com token malformado                          | HTTP 401 com envelope RFC 7807                                                             |
| **T16** | `requireAuth` com Bearer válido                     | Rota protegida `GET /test-protected` com token válido                              | HTTP 200, handler executa e retorna payload de sucesso                                     |
| **T17** | Persistência relacional no PostgreSQL               | Consulta direta Drizzle `db.select().from(session).where(...)`                     | Exatamente 1 linha correspondente persistida na tabela `session`                           |
| **T18** | `POST /sign-out` invalida sessão                    | `POST /api/auth/sign-out` com Bearer, seguido de `GET /get-session`                | Sign-out responde 200 `{ success: true }`, `get-session` subsequente devolve `null`        |
| **T19** | Rate limit desativado em ambiente de teste          | 15 requisições sequenciais de sign-in na mesma rota                                | Nenhuma requisição recebe HTTP 429 Too Many Requests (**prova de D-19**)                   |

---

## 7. Passo a Passo de Execução

1. **Ramificação e Isolamento Git:**
   - Confirmar branch `feature/f3s01-better-auth` a partir de `develop`.
2. **Resolução de Divergência de Banco de Dados:**
   - Adicionar `issuer: text('issuer').notNull().default('credential')` em `src/db/schema/users.schema.ts`.
   - Gerar a migração `pnpm db:generate` (`drizzle/0001_*.sql`).
3. **Construção dos Módulos Core de Autenticação:**
   - Preencher `src/modules/auth/auth.config.ts`.
   - Preencher `src/shared/types/fastify.d.ts`.
   - Preencher `src/modules/auth/auth.plugin.ts`.
   - Preencher `src/modules/auth/auth.routes.ts`.
4. **Registro e Encadeamento em `src/app.ts`:**
   - Conectar `authPlugin` na posição estrita após `healthPlugin` e antes de `artistsRoutes`/`tracksRoutes`.
5. **Criação do Helper E2E e Suíte de Testes:**
   - Escrever `tests/e2e/helpers/auth.ts`.
   - Escrever `tests/integration/auth.test.ts` cobrindo nominalmente T1 a T19.
6. **Execução da Pipeline de Validação Local:**
   - `pnpm typecheck` (zero erros de TypeScript).
   - `pnpm lint` (zero violações ESLint e boundaries).
   - `pnpm format` (formatação de código).
   - `pnpm test` (100% da suíte passando, incluindo os 19 novos testes).
   - `pnpm build` (empacotamento via `tsup`).
7. **Validação Manual do Definition of Done (DoD):**
   - Testar comandos cURL com geração de token e `GET /api/auth/get-session`.
   - Verificar logs de console confirmando atuação do `redact` do Pino (nenhum token/senha visível no stdout).
8. **Atualização da Memória Técnica:**
   - Registrar decisões em `.agents/memory/DECISIONS.md`.
   - Registrar status e contratos em `.agents/memory/PROGRESS.md`.
   - Criar relatório de conclusão em `.agents/memory/F3-S01.md`.

---

## 8. Definition of Done (DoD)

- [ ] Todos os 19 casos de teste (T1–T19) implementados e com status **verde**.
- [ ] Autenticação simultânea comprovada por Bearer e por Cookie (T9 e T10).
- [ ] Header `set-auth-token` recebido e validado.
- [ ] Nenhum token, senha ou cookie exposto em logs (`redact` do Pino ativo e validado).
- [ ] Rotas `/health` e `/docs` operando normalmente.
- [ ] Divergência de schema do Better Auth solucionada com migração versionada.
- [ ] Pipeline de qualidade 100% verde (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`).
- [ ] PR aberto contra `develop` com CI verde no GitHub Actions.
