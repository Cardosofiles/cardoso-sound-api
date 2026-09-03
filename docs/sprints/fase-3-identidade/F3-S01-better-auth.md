# F3-S01 — Better Auth: Configuração, Plugin e Guards

|                |                                                                      |
| -------------- | -------------------------------------------------------------------- |
| **Fase**       | F3 — Identidade                                                      |
| **Branch**     | `feature/f3s01-better-auth`                                          |
| **Depende de** | F2-S04                                                               |
| **Entrega**    | R09–R12 · `request.user` / `request.session` · `fastify.requireAuth` |

> **Sprint de maior risco do projeto.** A integração Better Auth ↔ Fastify é feita à mão
> (não há adaptador oficial), envolve conversão entre a API de `Request`/`Response` do
> Fetch e o par `FastifyRequest`/`FastifyReply`, e o cookie e o token precisam funcionar
> **ao mesmo tempo**. Planeje com folga.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F1-S06.md — você precisa saber a ordem de registro dos
plugins em src/app.ts para encaixar o auth.plugin no lugar certo.

Sprint alvo: docs/sprints/fase-3-identidade/F3-S01-better-auth.md
Specs obrigatórias: docs/specs/04-autenticacao-e-seguranca.md (INTEIRA),
                    docs/specs/03-contrato-da-api.md (§5)

Use o MCP context7 para confirmar a API do better-auth na versão instalada ANTES de
codar — esta lib muda rápido e a memória do modelo costuma estar desatualizada.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Autenticação funcionando por **bearer token e por cookie, simultaneamente** (D-13), com
`request.user` e `request.session` disponíveis em toda requisição e um guard reutilizável
para as rotas protegidas de F3-S02, F4-S01 e F4-S02.

---

## 3. Contratos esperados

### Rotas (montadas pela lib, não por você) — spec `03` §5

`POST /api/auth/sign-up/email` · `POST /api/auth/sign-in/email` ·
`POST /api/auth/sign-out` · `GET /api/auth/get-session`

### `src/modules/auth/auth.config.ts`

```ts
export const auth: ReturnType<typeof betterAuth>;
export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
```

Configuração normativa completa: **spec `04` §1**. `plugins: [bearer()]` é obrigatório.

### `src/modules/auth/auth.plugin.ts`

```ts
export const authPlugin: FastifyPluginAsync; // via fastify-plugin
```

Faz as quatro coisas da **spec `04` §2**: monta o handler, decora, resolve a sessão em
`onRequest`, expõe `fastify.requireAuth`.

### `src/shared/types/fastify.d.ts`

Augmentation de `FastifyRequest.user`, `FastifyRequest.session` e
`FastifyInstance.requireAuth` — spec `04` §2.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/modules/auth/auth.config.ts
src/modules/auth/auth.plugin.ts
src/modules/auth/auth.routes.ts        # ver §5.5 — pode ficar como reexport documentado
src/shared/types/fastify.d.ts
```

### Criar

```
tests/integration/auth.test.ts
tests/e2e/helpers/auth.ts
```

### Editar

```
src/app.ts                              # registrar authPlugin ANTES das rotas de domínio
src/db/schema/users.schema.ts           # SOMENTE se o CLI do Better Auth acusar divergência
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F3-S01.md
```

**Não toque em:** `src/modules/{artists,tracks,users,playlists,favorites}/**` ·
`src/plugins/**` · `src/db/client.ts`.

> Se `users.schema.ts` precisar mudar, isso **exige uma migração nova** (`0001_*.sql`).
> Nesse caso, pare e reporte antes — pode ser um sprint corretivo próprio.

---

## 5. Passo a passo

### 5.1 Confirmar o schema antes de tudo

```bash
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

Compare com o que F2-S01 escreveu à mão. **Divergiu → pare e reporte.** Prosseguir com
schema errado gera erro obscuro de adapter em runtime, difícil de rastrear.

### 5.2 `auth.config.ts`

Spec `04` §1, literalmente. Cuidados:

- `drizzleAdapter(db, { provider: 'pg', schema })` — passar o `schema` deixa o adapter
  usar as suas tabelas em vez de inferir nomes.
- `rateLimit.enabled: isProduction` (D-19) — ligado em teste, derruba a suíte com 429.
- `trustedOrigins: env.CORS_ORIGIN_LIST`.
- `plugins: [bearer()]` — importado de `better-auth/plugins`.

### 5.3 `auth.plugin.ts` — a ponte Fastify ↔ Fetch

Esta é a parte delicada. Roteiro:

**Montar o handler**

```ts
fastify.route({
  method: ['GET', 'POST', 'OPTIONS'],
  url: '/api/auth/*',
  // desliga a validação Zod: o corpo é da lib
  schema: { hide: true },
  async handler(request, reply) {
    const url = new URL(request.url, env.BETTER_AUTH_URL);
    const headers = new Headers();
    for (const [k, v] of Object.entries(request.headers)) {
      if (typeof v === 'string') headers.append(k, v);
      else if (Array.isArray(v)) for (const item of v) headers.append(k, item);
    }
    const req = new Request(url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    const res = await auth.handler(req);
    reply.status(res.status);
    res.headers.forEach((value, key) => {
      void reply.header(key, value);
    });
    return reply.send(res.body ? await res.text() : null);
  },
});
```

- **`set-cookie` múltiplo:** `Headers.forEach` já entrega os valores concatenados
  corretamente na maioria dos runtimes, mas **verifique**. Se vier um só, use
  `res.headers.getSetCookie()` e faça `reply.header('set-cookie', arrayDeCookies)`.
  **Teste isso explicitamente** (T5).
- `content-type` da resposta precisa sobreviver; não force `application/json` na mão.
- A rota **não** leva `requireAuth` — ela é o mecanismo de login.

**Decorar e resolver a sessão**

```ts
fastify.decorateRequest('user', null);
fastify.decorateRequest('session', null);

fastify.addHook('onRequest', async (request) => {
  try {
    const result = await auth.api.getSession({ headers: toHeaders(request.headers) });
    request.user = result?.user ?? null;
    request.session = result?.session ?? null;
  } catch {
    request.user = null;
    request.session = null;
  }
});
```

**O hook nunca lança.** Sessão inválida vira `null`; quem decide o que fazer é o guard.

**Expor o guard**

```ts
fastify.decorate('requireAuth', async (request: FastifyRequest) => {
  if (!request.user || !request.session) throw new UnauthorizedError('Authentication required');
});
```

Registre o plugin com `fastify-plugin` para os decorators escaparem do escopo.

### 5.4 `app.ts`

```
… under-pressure → swagger → health → authPlugin → rotas de domínio
```

`authPlugin` **antes** das rotas de domínio, para o hook `onRequest` já estar ativo
quando elas rodarem.

### 5.5 `auth.routes.ts`

O scaffold reserva este arquivo, mas as rotas são montadas pelo plugin. Duas opções
aceitáveis — **escolha e registre em `DECISIONS.md`**:

- (a) deixar um comentário explicando que as rotas vivem em `auth.plugin.ts`, com
  `export {};`
- (b) mover a rota coringa `/api/auth/*` para cá e o plugin só importa

Prefira **(b)** se ficar legível: mantém a convenção `*.routes.ts` significando "rotas".

### 5.6 Helper de E2E

`tests/e2e/helpers/auth.ts` com `signUpAndGetToken(app, email?)` — spec `05` §4.
E-mail único por chamada. **F3-S02, F4-S01, F4-S02 e F4-S03 dependem dele.**

---

## 6. Casos de teste obrigatórios

`tests/integration/auth.test.ts` — harness + `buildApp()` + `app.inject()`.

| #   | Caso                                                | Esperado                                                |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| T1  | `POST /api/auth/sign-up/email` válido               | 200, corpo com `user`, e-mail correto                   |
| T2  | Sign-up devolve header `set-auth-token`             | header presente e não vazio                             |
| T3  | Sign-up devolve `Set-Cookie` de sessão              | header presente                                         |
| T4  | Sign-up com senha de 5 chars                        | erro (4xx), usuário **não** criado                      |
| T5  | Múltiplos `Set-Cookie` são todos repassados         | conferir a contagem contra `res.headers.getSetCookie()` |
| T6  | Sign-up com e-mail já usado                         | erro (4xx), sem duplicar linha em `"user"`              |
| T7  | `POST /sign-in/email` com senha correta             | 200 + token                                             |
| T8  | `POST /sign-in/email` com senha errada              | 401                                                     |
| T9  | `GET /get-session` com Bearer                       | 200 com `user` e `session`                              |
| T10 | `GET /get-session` com cookie                       | 200 — prova o D-13                                      |
| T11 | `GET /get-session` sem credencial                   | `null` ou 401 (registre o que a lib faz)                |
| T12 | `request.user` populado em rota qualquer com Bearer | rota de teste devolve o id                              |
| T13 | `request.user === null` sem credencial              | rota de teste devolve `null`, **sem lançar**            |
| T14 | `requireAuth` sem credencial                        | **401** com o envelope de erro do projeto               |
| T15 | `requireAuth` com Bearer inválido/expirado          | 401                                                     |
| T16 | `requireAuth` com Bearer válido                     | passa; handler executa                                  |
| T17 | Sessão persiste em `session` no banco               | `SELECT` encontra a linha                               |
| T18 | `POST /sign-out` invalida a sessão                  | `get-session` seguinte não autentica                    |
| T19 | Rate limit do Better Auth **desligado** em teste    | 15 sign-ins seguidos sem 429                            |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev

TOKEN=$(curl -s -X POST localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Joao","email":"joao@teste.com","password":"senha-de-teste-123"}' \
  -D - -o /dev/null | grep -i '^set-auth-token:' | cut -d' ' -f2 | tr -d '\r')
echo "$TOKEN"
curl -s localhost:3000/api/auth/get-session -H "authorization: Bearer $TOKEN" | jq
```

- [ ] T1–T19 verdes
- [ ] Bearer **e** cookie autenticam (T9 e T10) — a prova de D-13
- [ ] `set-auth-token` chega ao cliente
- [ ] Nenhum token, senha ou cookie aparece nos logs (`redact` de F1-S05 funcionando) —
      provoque um erro em rota autenticada e leia o stdout
- [ ] `/docs` continua abrindo (as rotas de auth podem ficar ocultas)
- [ ] `users.schema.ts` conferido contra o CLI do Better Auth; versão registrada
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`set-cookie` colapsado em um só** é o bug mais comum desta ponte: a sessão parece
   funcionar em bearer e falha em cookie. T5 existe exatamente para pegar isso.
2. **`request.body` já vem parseado pelo Fastify.** Reserializar com `JSON.stringify`
   é necessário — mas se o content-type for `application/x-www-form-urlencoded`, quebra.
   O Better Auth usa JSON; documente a suposição.
3. **URL relativa em `new Request()` lança.** Precisa ser absoluta: `new URL(request.url, env.BETTER_AUTH_URL)`.
4. **`decorateRequest` com objeto é compartilhado entre requisições.** Por isso o valor
   inicial é `null`, nunca `{}`.
5. **Hook `onRequest` que lança derruba rota pública.** Envolva em `try/catch` e sempre
   caia para `null`.
6. **Rate limit do Better Auth ligado em teste** produz 429 aleatório a partir da 11ª
   requisição. `enabled: isProduction` (D-19). T19 prova.
7. **`declare module 'fastify'` num arquivo sem import/export** não é tratado como módulo
   e o augmentation não aplica. Mantenha o `import 'fastify';` no topo.
8. **A rota coringa `/api/auth/*` precisa ficar fora da validação Zod** e fora do
   `serializerCompiler`, senão o corpo da lib é podado.
9. **`auth.api.getSession` exige um `Headers` real**, não o objeto de headers do Fastify.
   Converta.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: (a) como `set-cookie` múltiplo foi repassado;
  (b) o que foi feito com `auth.routes.ts` (§5.5); (c) a versão do `better-auth` e se o
  schema divergiu.
- **`PROGRESS.md`** — F3-S01 ✅, R09–R12 nos contratos entregues, próximo = F3-S02.
- **`F3-S01.md`** — o código da ponte Fetch↔Fastify comentado, a assinatura de
  `signUpAndGetToken` e a posição do `authPlugin` em `app.ts`. **Quatro sprints dependem
  disso.**
