# F5-S04 — Endurecimento de Sessão, Schema e Contrato

|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| **Fase**       | F5 — Produção · **3º dos 6 sprints de blindagem** (D-49)         |
| **Branch**     | `feature/f5s04-sessao-schema-e-contrato`                         |
| **Depende de** | F5-S03                                                           |
| **Entrega**    | GAP-13, GAP-16, GAP-19, GAP-20, GAP-23, GAP-26 · **achado R-01** |

> **Primeiro sprint da blindagem que gera migração.** Ela é pequena — três índices e uma
> restrição única — mas é a base de que F5-S05 e F5-S06 dependem: as tabelas de 2FA e Passkey
> entram em cima deste schema.
>
> Também é o sprint que fecha a última dívida de **contrato** do projeto: erros de `/api/auth/*`
> passam a trazer o envelope RFC 7807 do resto da API **sem perder** as chaves nativas do
> Better Auth.

> **Emenda de 2026-09-09 — o achado R-01 entra neste sprint.** A revisão de segurança pós-merge de
> F5-S02 (`docs/agents-reviews/review-f5-s02-validacao-ponta-a-ponta.md`) mediu que a ponte
> `auth.plugin.ts` repassa o `x-forwarded-for` **cru do cliente** ao Better Auth, que resolve o IP
> só por header. Consequência medida: as 8 regras de `AUTH_RATE_LIMIT_RULES` são contornáveis e
> `session.ip_address` é falsificável por quem alcançar a aplicação fora da borda.
>
> R-01 vem para cá, e não para F5-S07, por uma razão objetiva: **`auth.plugin.ts` já está na lista
> `Editar` deste sprint e está na lista `Não toque em` do F5-S07.** A correção é a terceira mudança
> cirúrgica da §3.3, detalhada na **§5.7**, com os casos **T29–T33** e as **Armadilhas 11–14**.
> Não é GAP da auditoria — é achado de revisão — e por isso aparece na linha **Entrega** com nome
> próprio.

---

## 0. Pré-requisitos

Nenhum trabalho humano. Docker rodando (a suíte de integração usa Testcontainers).

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-22 (redaction), D-39 (edição manual de migração), D-40 (schemas Better Auth),
D-44 (ponte Set-Cookie), D-47 (corridas em tabelas associativas) e D-60 (trustProxy
por profundidade E validação do peer) — as seis decidem partes deste sprint.
Leia .agents/memory/F2-S01.md (entregou o schema e a migração inicial que você vai
estender) e .agents/memory/F3-S01.md (entregou a ponte Fastify↔Fetch que você vai
alterar com MUITO cuidado).
Leia .agents/memory/F5-S02.md §5 e docs/agents-reviews/review-f5-s02-validacao-ponta-a-ponta.md
(achado R-01) — descrevem, com medições, o defeito que a §5.7 deste sprint corrige.

Sprint alvo: docs/sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§6.1, §8.4, §8.5, §9),
                    docs/specs/02-modelo-de-dados.md,
                    docs/specs/04-autenticacao-e-seguranca.md (§2, §5)

ANTES de escrever qualquer código, execute a §5.1: confirme a assinatura de
session.cookieCache e de `logger` nas opções de betterAuth() na versão instalada,
e rode `pnpm dlx @better-auth/cli@latest generate` para ver se o schema atual acusa
diferença ANTES de qualquer alteração sua. Reporte as duas coisas.

A §5.7 (achado R-01) NÃO tem etapa de confirmação: as assinaturas e os comportamentos
do Better Auth de que ela depende já foram medidos e estão transcritos no próprio
sprint. Se algum deles não bater com o pacote instalado, PARE e reporte — não adapte
por conta própria. Foi exatamente essa adaptação silenciosa que reprovou F5-S02.

A migração é gerada por `pnpm db:generate`, REVISADA por você linha a linha, e só então
aplicada por `pnpm db:migrate`. `pnpm db:push` é proibido.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Tirar do caminho quente da aplicação uma consulta ao banco por requisição, dar ao PostgreSQL os
índices que os fluxos de autenticação já assumem que existem, e fechar duas divergências de
contrato que o cliente Flutter paga.

E tirar do cliente a capacidade de escolher o próprio IP nas rotas de autenticação.

Sete correções, agrupadas por afinidade de arquivo:

1. **Sessão resolvida do banco em toda requisição** (GAP-13). O hook `onRequest` do
   `auth.plugin.ts` é global: roda em `/health` — que está no `allowList` do rate limit por D-20 e
   é a sonda de liveness da Railway —, em `/docs`, no catálogo público e na própria rota coringa
   `/api/auth/*`, que em seguida resolve a sessão **de novo**.
2. **`account` sem restrição única na identidade do provedor** (GAP-16). Callbacks OAuth
   concorrentes duplicam a linha — a mesma classe de corrida que D-47 tratou deliberadamente em
   `playlist_tracks` e `favorites`.
3. **Três índices ausentes** (GAP-19) nas colunas que o cascade de exclusão e a verificação de
   e-mail percorrem.
4. **Nome do cookie divergente no OpenAPI** (GAP-20) — o Swagger UI e qualquer cliente gerado a
   partir do spec enviam um cookie que em produção não existe.
5. **Logger do Better Auth despejando e-mails em stdout** (GAP-23).
6. **Erros de `/api/auth/*` fora do envelope RFC 7807** (GAP-26).
7. **IP do Better Auth escolhido pelo cliente** (**R-01**). A ponte repassa o `x-forwarded-for` cru;
   o Better Auth resolve o IP só por header, sem socket. Quem alcança a aplicação fora da borda
   escolhe a própria chave de rate limit **e** o próprio `session.ip_address`. Mesma família dos
   itens 1 e 6 — tudo em `auth.plugin.ts`.

**Não faz parte deste sprint:** tabelas de 2FA (F5-S05) · tabela de Passkey (F5-S06) · tabela
`rate_limit` (F5-S07) · a dimensão de sessão no `keyGenerator` do Fastify (F5-S07, D-55) ·
qualquer alteração de `emailAndPassword` · qualquer alteração em `advanced.ipAddress` de
`auth.config.ts`, que a revisão de F5-S02 **aprovou** e a §5.7 explica por que fica como está.

---

## 3. Contratos esperados

### 3.1 Schema — spec `08` §6.1

```ts
// session
(t) => [index('session_user_id_idx').on(t.userId)]

// account
(t) => [
  index('account_user_id_idx').on(t.userId),
  uniqueIndex('account_provider_account_unique').on(t.providerId, t.accountId),
]

// verification
(t) => [index('verification_identifier_idx').on(t.identifier)]
```

Nenhuma coluna nova, nenhuma coluna alterada. **Só índices e uma restrição única.**

### 3.2 `auth.config.ts` — duas chaves

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7,   // inalterado
  updateAge: 60 * 60 * 24,       // inalterado
  cookieCache: { enabled: true, maxAge: 5 * 60 },   // novo — GAP-13
},
logger: { level: 'error' },                          // novo — GAP-23
```

### 3.3 `auth.plugin.ts` — três mudanças cirúrgicas

```ts
export function shouldResolveSession(url: string): boolean; // exportada para teste
export function toRfc7807(status: number, rawBody: string): string; // exportada para teste

/**
 * R-01 — quando `clientIp` é passado, o `x-forwarded-for` do cliente é
 * SOBRESCRITO por ele. Sem `clientIp`, o comportamento atual é preservado.
 */
export function toFetchHeaders(incoming: IncomingHttpHeaders, clientIp?: string): Headers;
```

`toFetchHeaders` **já existe e já é exportada**; ganha um segundo parâmetro **opcional**, o que
mantém as chamadas atuais válidas. Os dois call sites da ponte passam a informar `request.ip`.

A ponte em si — método, `getSetCookie()`, repasse de headers de **resposta** — **não muda**. D-44
continua valendo integralmente.

### 3.4 `swagger.plugin.ts` — nome do cookie derivado

```ts
export function sessionCookieName(nodeEnv: string, baseUrl: string): string;
// 'production' OU baseUrl https  → '__Secure-better-auth.session_token'
// caso contrário                 → 'better-auth.session_token'
```

### 3.5 Envelope de erro de `/api/auth/*` — **aditivo, nunca substitutivo**

Forma normativa: **spec `08` §8.4**.

```jsonc
{
  "code": "INVALID_EMAIL_OR_PASSWORD", // ← original, preservado
  "message": "Invalid email or password", // ← original, preservado
  "statusCode": 401, // ← acrescentado
  "error": "Unauthorized", // ← acrescentado
  "details": null, // ← acrescentado
}
```

Preservar `code` e `message` no topo é **inegociável**: o SDK oficial do Better Auth e o cliente
Flutter já os leem. Corpo não-JSON é repassado **intacto**.

---

## 4. Blast radius

### Criar

```
drizzle/000X_*.sql                                   # gerada por db:generate, revisada por você
tests/unit/modules/auth/auth.plugin.test.ts
tests/unit/plugins/swagger-cookie.test.ts
tests/integration/auth-error-envelope.test.ts
tests/integration/schema-auth-indexes.test.ts
tests/integration/auth-client-ip.test.ts          # R-01 — T32/T33
```

### Editar

```
src/db/schema/users.schema.ts        # só índices e uniqueIndex (§3.1)
src/modules/auth/auth.config.ts      # session.cookieCache + logger.level
src/modules/auth/auth.plugin.ts      # shouldResolveSession + toRfc7807 + clientIp em toFetchHeaders
src/plugins/swagger.plugin.ts        # sessionCookieName no securityScheme
docs/openapi.json                    # regenerado — o securityScheme MUDA
.agents/memory/PROGRESS.md
.agents/memory/F5-S04.md
```

**Não toque em:** `src/config/env.ts` · `src/app.ts` · `src/plugins/{rate-limit,cors,helmet,under-pressure,error-handler,health}.plugin.ts` ·
`src/modules/{users,playlists,favorites,artists,tracks}/**` · `src/shared/email/**` ·
`drizzle/0000_*.sql` e `drizzle/0001_*.sql` (**migração aplicada nunca se edita** — D-39 autoriza
edição manual da migração **nova**, não das antigas) · `tests/e2e/**`.

> **`DECISIONS.md` não está na lista.** Nenhuma decisão nova é esperada — **R-01 incluído**. A
> correção da §5.7 é o **D-60 aplicado a um segundo consumidor**, não uma decisão nova: D-60 já
> declarou que `req.ip` é confiável, e a §5.7 apenas o entrega ao Better Auth em vez do header cru.
> Se a §5.1 revelar que `cookieCache` ou `logger` não existem com essa forma, **pare e reporte**.

> **Escopo dentro de `auth.config.ts`:** só `session.cookieCache` e `logger`. O bloco
> `advanced.ipAddress` (`ipAddressHeaders` + `trustedProxies`) foi **auditado e aprovado** na
> revisão de F5-S02 e **fica exatamente como está** — a §5.7 explica por que mantê-lo é
> deliberado, e não redundância.

> **`docs/openapi.json` ESTÁ na lista, e é o único sprint da blindagem em que está.** O
> `securityScheme` do cookie muda de nome. Regenere com `pnpm openapi:export` e confira que a
> **única** diferença no diff é o `name` do cookie — qualquer outra diferença é escopo vazando.

---

## 5. Passo a passo

### 5.1 Confirmar duas assinaturas e o estado do schema — antes de qualquer código

```bash
# (a) session.cookieCache existe e tem essa forma?
grep -rn "cookieCache" node_modules/better-auth/dist/ | head

# (b) betterAuth aceita `logger` nas opções, e qual o formato do level?
grep -rn "logger" node_modules/better-auth/dist/types/*.d.ts | head

# (c) o schema atual está sincronizado ANTES de você mexer?
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

O item (c) é o mais importante: rode **antes** e **depois**. Índices e restrição única **não**
alteram o que o CLI gera — se ele acusar diferença de coluna, você mexeu em algo que não devia,
ou o schema já estava dessincronizado antes deste sprint. Nos dois casos, **pare e reporte**.

### 5.2 Índices e restrição única (GAP-16, GAP-19)

Acrescente o terceiro argumento das três `pgTable` conforme a §3.1. Depois:

```bash
pnpm db:generate       # gera drizzle/000X_*.sql
# LEIA o SQL gerado, linha a linha, antes de aplicar
pnpm db:migrate
```

O SQL esperado tem exatamente quatro comandos: três `CREATE INDEX` e um
`CREATE UNIQUE INDEX ... ON "account" ("provider_id","account_id")`.

**Se a restrição única falhar ao aplicar**, o banco já tem linhas duplicadas — a corrida do
GAP-16 já aconteceu. Nesse caso **pare e reporte**: deduplicar dados de produção é decisão do
dono, não do sprint. Localize antes de aplicar:

```sql
SELECT provider_id, account_id, count(*)
FROM account GROUP BY 1, 2 HAVING count(*) > 1;
```

Por que a restrição importa: a decisão de linking do Better Auth é read-then-write **sem guarda
no banco** (`dist/oauth2/link-account.mjs:78`). Sem o índice único, dois callbacks OAuth
simultâneos criam duas linhas para a mesma identidade de provedor — exatamente a classe de
corrida que D-47 tratou em `playlist_tracks`.

### 5.3 `cookieCache` e o curto-circuito do hook (GAP-13)

Duas metades, e **as duas são necessárias**:

```ts
// auth.config.ts
session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24,
           cookieCache: { enabled: true, maxAge: 5 * 60 } },
```

```ts
// auth.plugin.ts
export function shouldResolveSession(url: string): boolean {
  return !url.startsWith('/health') && !url.startsWith('/api/auth');
}

fastify.addHook('onRequest', async (request) => {
  if (!shouldResolveSession(request.url)) {
    request.user = null;
    request.session = null;
    return;
  }
  // ... resolução atual, inalterada, com o mesmo try/catch
});
```

O curto-circuito de `/api/auth` é seguro porque a rota coringa resolve a sessão de novo dentro do
`auth.handler` — hoje ela é resolvida **duas vezes** por requisição de autenticação.

O curto-circuito de `/health` é o que fecha a amplificação: `/health` está no `allowList` do rate
limit por D-20 — é a rota deliberadamente sem teto — e hoje uma requisição a ela com qualquer
`Authorization` em formato de token vira uma consulta à tabela `session`.

**O hook continua nunca lançando.** O `try/catch` de `auth.plugin.ts:82-85` fica como está: rota
pública não pode quebrar por cookie inválido.

### 5.4 Envelope de erro (GAP-26) — a parte delicada

```ts
export function toRfc7807(status: number, rawBody: string): string {
  if (status < 400) return rawBody;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return rawBody;
  } // não-JSON: intacto
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return rawBody;
  return JSON.stringify({
    ...parsed, // code e message preservados byte a byte
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Error',
    details: null,
  });
}
```

Três invariantes, todas cobertas por teste:

- **Aditivo.** Nenhuma chave original é removida ou reescrita. `code` e `message` continuam no
  topo, porque o SDK do Better Auth e o cliente Flutter os leem.
- **Só 4xx e 5xx.** Resposta de sucesso passa **intacta** — mexer no corpo de sucesso quebra o
  sign-in, que devolve `{ user, session, token }`.
- **Corpo não-JSON passa intacto.** Redirect, HTML, vazio. Não invente envelope sobre o que você
  não conseguiu parsear.

> **Cuidado com o `content-length`.** O corpo cresce. Se o repasse de headers da ponte estiver
> encaminhando `content-length` da resposta do Better Auth, ele fica errado e o cliente trunca.
> Confira o loop de `auth.plugin.ts:62-66` e, se `content-length` estiver sendo repassado,
> **remova-o junto com o `set-cookie`** — o Fastify recalcula. Este é o defeito mais provável
> deste sprint.

### 5.5 Logger do Better Auth (GAP-23)

`dist/api/routes/sign-up.mjs:202` loga `Sign-up attempt for existing email: ${email}` em `info`;
`sign-in.mjs:323/330/337` logam `"User not found"` / `"Invalid password"` em `warn`. São o logger
de console **da própria lib**, fora da redaction do Pino (D-22): endereços de e-mail em stdout de
produção, num repositório público com stdout da Railway como coletor.

```ts
logger: { level: 'error' },
```

Confirme na §5.1 (b) o formato aceito. Se a lib expuser um logger customizável, prefira
encaminhar para o logger da aplicação — mas **só** se isso não exigir importar `src/app.ts` dentro
de `auth.config.ts`, o que inverteria a dependência e quebraria o `eslint-plugin-boundaries`.

### 5.6 Nome do cookie no OpenAPI (GAP-20)

Em produção o Better Auth prefixa o cookie: `__Secure-better-auth.session_token`, sempre que
`baseURL` for https **ou** `NODE_ENV=production` (`dist/cookies/index.mjs:23,275`). O
`securityScheme` de `swagger.plugin.ts:50` declara o nome sem prefixo.

Derive do **mesmo predicado** que a lib usa (§3.4), regenere o `openapi.json` e confira o diff.

### 5.7 O IP que o Better Auth enxerga (R-01)

**Não precisa confirmar nada no pacote antes de codar** — a revisão de F5-S02 já mediu tudo o que
segue, em `@better-auth/core@1.7.2`. Os números estão aqui para você **não** precisar adivinhar. Se
algum deles não bater com a versão instalada quando você rodar, **pare e reporte**.

O que a ponte faz hoje (`auth.plugin.ts:43` e `:78`): monta um `Request` da Fetch API **só com
headers**, sem socket. O Better Auth então resolve o IP exclusivamente por header
(`dist/utils/ip.mjs:196-214`), e `getIPFromHeader` (`:171-197`) confia **incondicionalmente** no
salto mais à direita quando ele não pertence a `trustedProxies`. Medido: 12 `POST /sign-in/email`
girando o salto da direita devolvem **401 doze vezes, nenhum 429**; e um sign-up com
`X-Forwarded-For: 6.6.6.6` a partir de `127.0.0.1` grava `session.ip_address = 6.6.6.6`.

A correção é entregar ao Better Auth o `request.ip` que o Fastify **já validou** com o predicado do
D-60, em vez do header cru:

```ts
export function toFetchHeaders(incoming: IncomingHttpHeaders, clientIp?: string): Headers {
  const headers = new Headers();
  // ... loop atual, inalterado ...
  if (clientIp) headers.set('x-forwarded-for', clientIp); // set, NUNCA append
  return headers;
}
```

E os **dois** call sites passam a informar o IP:

```ts
const headers = toFetchHeaders(request.headers, request.ip); // rota coringa (:43)
// ...
await auth.api.getSession({ headers: toFetchHeaders(request.headers, request.ip) }); // hook (:78)
```

O hook já não roda em `/api/auth` depois da §5.3, mas passe o IP nele do mesmo jeito: sai mais
barato que descobrir a assimetria seis meses depois.

**Por que `advanced.ipAddress.trustedProxies` continua em `auth.config.ts`.** Ele fica **redundante**
no caminho feliz — com um header de valor único e já confiável, a varredura simplesmente o devolve.
Considerei removê-lo e rejeitei: se alguém remover o `clientIp` de um dos call sites no futuro, o
`trustedProxies` volta a ser a única defesa e o comportamento degrada para o de F5-S02, não para
"cliente escolhe o IP". Redundância que falha para o lado seguro **fica**.

**O preço dessa escolha, medido — e é a Armadilha 13.** Se `request.ip` cair **dentro** de
`TRUSTED_PROXIES`, a varredura considera todos os saltos confiáveis e devolve `null`; o limitador de
autenticação inteiro colapsa na chave compartilhada `no-trusted-ip|<path>`:

```
getIPFromHeader('203.0.113.7', { trustedProxies: ['10.0.0.0/8'] })  ->  '203.0.113.7'   ✅
getIPFromHeader('10.0.0.5',    { trustedProxies: ['10.0.0.0/8'] })  ->  null            ⚠️
```

Isso **só** acontece com `TRUST_PROXY_HOPS` subestimado — a mesma má configuração que já colapsaria
o limitador global do Fastify. Não é regressão nova; é uma razão a mais para o valor estar certo, e
está registrado na pendência **P3** do `PROGRESS.md`. **T33 existe para prender esse comportamento.**

**Formatos de `request.ip` — os três já foram verificados, não reabra:**

| Entrada              | O que o Better Auth faz               | Resultado                           |
| -------------------- | ------------------------------------- | ----------------------------------- |
| `127.0.0.1`          | aceita                                | `127.0.0.1`                         |
| `::ffff:203.0.113.7` | normaliza IPv4-mapped                 | `203.0.113.7`                       |
| `2001:db8:a:b::1`    | agrupa por `/64` (`ipv6Subnet ?? 64`) | `2001:0db8:000a:000b:0000:...:0000` |

O agrupamento IPv6 por `/64` é **intencional** na lib (um `/64` por assinante) — não é defeito e não
se corrige aqui.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/modules/auth/auth.plugin.test.ts`

| #   | Caso                                                        | Esperado                                                         |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| T1  | `shouldResolveSession('/health')` e `('/health/ready')`     | `false`                                                          |
| T2  | `shouldResolveSession('/api/auth/get-session')`             | `false`                                                          |
| T3  | `shouldResolveSession('/api/v1/me')` e `('/api/v1/tracks')` | `true`                                                           |
| T4  | `shouldResolveSession('/docs')`                             | `true` (irrelevante, mas explícito)                              |
| T5  | `toRfc7807(401, '{"code":"X","message":"Y"}')`              | mantém `code` e `message`; soma `statusCode`, `error`, `details` |
| T6  | `toRfc7807(200, '{"user":{...},"token":"t"}')`              | **idêntico à entrada**                                           |
| T7  | `toRfc7807(400, '<html>erro</html>')`                       | **idêntico à entrada**                                           |
| T8  | `toRfc7807(500, '')`                                        | **idêntico à entrada**                                           |
| T9  | `toRfc7807(400, '[1,2,3]')`                                 | **idêntico à entrada** — array não é envelope                    |
| T10 | `toRfc7807(404, '{"message":"m"}')`                         | `error === 'Not Found'`                                          |

### Unit — `tests/unit/plugins/swagger-cookie.test.ts`

| #   | Caso                                                        | Esperado                             |
| --- | ----------------------------------------------------------- | ------------------------------------ |
| T11 | `sessionCookieName('production', 'http://x')`               | `__Secure-better-auth.session_token` |
| T12 | `sessionCookieName('development', 'https://x')`             | `__Secure-better-auth.session_token` |
| T13 | `sessionCookieName('development', 'http://localhost:3333')` | `better-auth.session_token`          |

### Integração — `tests/integration/schema-auth-indexes.test.ts`

| #   | Caso                                                                                            | Esperado              |
| --- | ----------------------------------------------------------------------------------------------- | --------------------- |
| T14 | `pg_indexes` contém `session_user_id_idx`, `account_user_id_idx`, `verification_identifier_idx` | os três               |
| T15 | `pg_indexes` contém `account_provider_account_unique` e ele é **UNIQUE**                        | sim                   |
| T16 | Inserir duas linhas em `account` com o mesmo `(provider_id, account_id)`                        | erro `23505` — GAP-16 |
| T17 | `DELETE FROM "user"` em cascata com sessão e account                                            | sem órfão, sem erro   |

### Integração — `tests/integration/auth-error-envelope.test.ts`

| #   | Caso                                                            | Esperado                                                      |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| T18 | `POST /sign-in/email` com senha errada                          | corpo tem `code`, `message`, `statusCode`, `error`, `details` |
| T19 | O mesmo corpo, chave `code`                                     | valor **inalterado** em relação a antes                       |
| T20 | Sign-in bem-sucedido                                            | corpo **sem** `statusCode`/`error` acrescentados              |
| T21 | `content-length` da resposta de erro bate com o corpo recebido  | sem truncamento — armadilha 3                                 |
| T22 | Fluxo completo de F3 (sign-up → verify → sign-in → get-session) | verde — a ponte não regrediu                                  |
| T23 | Múltiplos `Set-Cookie` continuam chegando inteiros              | D-44 preservado                                               |

### Integração — sessão

| #   | Caso                                                                               | Esperado                                    |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| T24 | `GET /health` com `Authorization: Bearer <qualquer>` → contador de query da sessão | **zero** consultas a `session`              |
| T25 | `GET /api/v1/me` com bearer válido                                                 | 200, perfil correto                         |
| T26 | `GET /api/v1/me` com bearer inválido                                               | 401                                         |
| T27 | Duas requisições seguidas a `/api/v1/me` dentro de 5 min com o mesmo cookie        | a 2ª não consulta `session` — `cookieCache` |
| T28 | Suíte E2E completa                                                                 | verde                                       |

> **T24 e T27 precisam de instrumentação.** Use um spy no `pool.query` do harness de
> Testcontainers, ou `pg_stat_statements`. Se nenhum caminho for viável sem sair do blast radius,
> **degrade para asserção indireta** (o hook não é chamado / `shouldResolveSession` retorna false)
> e **diga isso em `F5-S04.md`** — asserção fraca declarada vale mais que asserção forte fingida.

### Unit — `tests/unit/modules/auth/auth.plugin.test.ts` (R-01)

| #   | Caso                                                                  | Esperado                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------- |
| T29 | `toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' }, '198.51.100.9')`    | `get('x-forwarded-for') === '198.51.100.9'` |
| T30 | O mesmo caso, contando as ocorrências do header                       | **uma só** — foi `set`, não `append`        |
| T31 | `toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' })` **sem** `clientIp` | `'6.6.6.6'` — retrocompatível               |

> T30 é o que separa `set` de `append`. Com `append`, o valor forjado sobrevive **à esquerda** e a
> varredura da direita para a esquerda ainda o ignoraria — mas a defesa passaria a depender da ordem
> dos valores em vez de ser incondicional. Asseverar a contagem prende o contrato.

### Integração — `tests/integration/auth-client-ip.test.ts` (R-01)

| #   | Caso                                                                                                                                            | Esperado                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| T32 | Sign-up via `app.inject({ remoteAddress: '198.51.100.9', headers: { 'x-forwarded-for': '6.6.6.6' } })`, depois `SELECT ip_address FROM session` | **`'198.51.100.9'`**, nunca `'6.6.6.6'` — o achado provado no banco |
| T33 | `getIPFromHeader('10.0.0.5', { trustedProxies: ['10.0.0.0/8'] })` importado da lib instalada                                                    | `null` — prende o colapso descrito na §5.7 e na Armadilha 13        |

> **T32 é o teste que reprova ou aprova R-01.** Antes da correção ele grava `6.6.6.6`. Em ambiente
> de teste `TRUSTED_PROXY_LIST` é vazia, então `buildTrustProxy` devolve `false` e `request.ip` é o
> `remoteAddress` do `inject` — o que torna a asserção determinística **sem** forçar
> `NODE_ENV=production` (D-19). É o mesmo princípio do T40 de F5-S02.
>
> T33 não testa código nosso: testa uma premissa da lib de que a nossa correção depende. Se um
> upgrade do Better Auth mudar isso, o teste vermelho é o aviso — que é exatamente o que faltou
> quando `fastify` mudou o `trustProxy` numérico por baixo do D-50.

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts   # sem diferença
pnpm openapi:export                 # regenera; o diff deve ser SÓ o nome do cookie
git diff --stat docs/openapi.json
```

**Verificação no banco:**

```bash
docker compose exec -T postgres psql -U cardoso -d cardoso_sound -c "\di session*|account*|verification*"
docker compose exec -T postgres psql -U cardoso -d cardoso_sound \
  -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('session','account','verification');"
```

**Verificação do envelope:**

```bash
pnpm dev
curl -s -X POST localhost:3333/api/auth/sign-in/email -H 'content-type: application/json' \
  -d '{"email":"nao-existe@x.com","password":"errada"}' | jq
# esperado: code, message, statusCode, error, details — os cinco
```

**Verificação manual de R-01** — precisa de socket real, `app.inject()` não serve. Use o artefato
compilado, como na §7 de F5-S02:

```bash
pnpm build
NODE_ENV=production TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
  RESEND_API_KEY=re_fake_para_boot CORS_ORIGIN=http://localhost:3333 node dist/server.js &

for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code} ' -X POST \
  -H "X-Forwarded-For: 198.51.100.$i" -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"xxxxxxxx"}' localhost:3333/api/auth/sign-in/email; done; echo
# ANTES da correção: 401 ×12
# DEPOIS: 401 ×5 e depois 429 — a rotação do salto à direita deixou de criar bucket
```

- [ ] T1–T33 verdes
- [ ] `grep -n "toFetchHeaders(request.headers)" src/modules/auth/auth.plugin.ts` **vazio** — os dois call sites passam `request.ip`
- [ ] A verificação manual de R-01 acima devolve **429 a partir da 6ª**, com a saída real colada em `F5-S04.md`
- [ ] `advanced.ipAddress` de `auth.config.ts` **inalterado** (`git diff` não o toca)
- [ ] Migração revisada linha a linha antes de aplicar; **4 comandos**, nada além
- [ ] `pnpm db:push` **não** foi usado em nenhum momento
- [ ] `@better-auth/cli generate` sem diferença de schema, antes e depois
- [ ] `docs/openapi.json` regenerado, e o diff é **só** o `name` do cookie
- [ ] Nenhum e-mail em stdout ao provocar sign-in com e-mail inexistente
- [ ] `curl -I` numa resposta de erro de `/api/auth/*`: `content-length` correto
- [ ] Suíte de F3 e F4 verde — a ponte não regrediu
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`content-length` repassado com o corpo reescrito.** O envelope faz o corpo crescer; o header
   antigo trunca a resposta no cliente. É o defeito mais provável do sprint e não aparece em
   `app.inject()`, só num cliente HTTP real. **T21 existe para pegá-lo** — e teste também com
   `curl`, não só com `inject`.
2. **Reescrever o corpo de sucesso.** `toRfc7807` só toca em `status >= 400`. Mexer no 200 do
   sign-in quebra `{ user, session, token }` e derruba o helper E2E inteiro.
3. **Substituir `code`/`message` em vez de acrescentar.** O SDK do Better Auth lê `code`. O
   envelope é **aditivo** — spec `08` §8.4 é explícita.
4. **Editar `drizzle/0000_*.sql` ou `0001_*.sql`.** Migração aplicada nunca se edita. D-39
   autoriza edição manual da migração **nova**, para o que o gerador não cobre — não das antigas.
5. **`pnpm db:push` "só para testar rápido".** Proibido em PR, CI e produção. Ele dessincroniza o
   histórico de migrações e o próximo `db:generate` gera lixo.
6. **A restrição única falhar por dados duplicados preexistentes.** Isso significa que a corrida
   do GAP-16 já aconteceu. **Pare e reporte** — deduplicar é decisão do dono.
7. **Curto-circuitar o hook em `/api/v1`.** Só `/health` e `/api/auth` saem. Curto-circuitar rota
   de domínio faz `request.user` ser sempre `null` e **toda rota protegida responde 401** — a
   suíte inteira cai de uma vez.
8. **Achar que `cookieCache` dispensa o curto-circuito.** Ele reduz consultas para quem tem
   cookie válido; não ajuda em nada contra requisição com token forjado, que é o vetor do GAP-13.
   As duas metades são necessárias.
9. **Importar `src/app.ts` dentro de `auth.config.ts`** para reaproveitar o logger. Inverte a
   dependência e quebra o `eslint-plugin-boundaries`. Se o encaminhamento exigir isso, use
   `logger: { level: 'error' }` e pronto.
10. **Regenerar o `openapi.json` sem olhar o diff.** Se aparecer mais que o nome do cookie, algo
    fora do escopo mudou.
11. **Usar `append` em vez de `set` no `x-forwarded-for` (R-01).** Com `append`, o valor forjado do
    cliente continua na cadeia e a defesa passa a depender da ordem dos valores. É `set`, e **T30**
    existe só para prender isso.
12. **Sobrescrever o IP em apenas um dos dois call sites.** São dois: a rota coringa
    (`auth.plugin.ts:43`) e o hook `onRequest` (`:78`). O curto-circuito da §5.3 já tira o hook do
    caminho de `/api/auth`, o que torna fácil "concluir" que ele não precisa — passe mesmo assim.
13. **Achar que R-01 dispensa `TRUST_PROXY_HOPS` correto — é o contrário.** Depois desta correção,
    um `HOPS` subestimado faz `request.ip` cair dentro de `TRUSTED_PROXIES`, o resolvedor devolver
    `null` e **todo** o rate limit de autenticação colapsar na chave `no-trusted-ip|<path>`.
    Medido na §5.7; preso por **T33**; registrado na pendência **P3** do `PROGRESS.md`.
14. **"Melhorar" R-01 removendo `advanced.ipAddress.trustedProxies`.** Ele fica redundante no
    caminho feliz, e é redundância deliberada: se o `clientIp` sumir de um call site no futuro, é
    ela que segura. A §5.7 registra a escolha. **Não remova.**

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** Se você precisou decidir algo, **pare e reporte**.
- **`PROGRESS.md`** — F5-S04 ✅, próximo = F5-S05. Acrescente a migração nova em **Contratos já
  entregues**. Marque a pendência **P6** (achado R-01) como resolvida, com a data.
- **`F5-S04.md`** — (a) o SQL exato da migração e por que são quatro comandos; (b) como o
  `toRfc7807` trata cada caso, com exemplo de corpo antes e depois — **o time do Flutter lê**;
  (c) se `content-length` estava sendo repassado e o que foi feito; (d) como T24 e T27 foram
  medidos, ou por que a asserção precisou ser degradada; (e) **a saída real da verificação manual
  de R-01** da §7, e a nota de que `advanced.ipAddress.trustedProxies` foi mantido de propósito —
  sem isso a próxima sessão remove por "redundância", que é a Armadilha 14.

---

## 10. Depois deste sprint

O schema está pronto para receber as tabelas de 2FA e Passkey, e a sessão saiu do caminho quente.
Todos os **GAPs de severidade MÉDIA e BAIXA** do domínio de sessão e contrato estão fechados.

Restam os dois GAPs ALTOS de funcionalidade ausente: **F5-S05** (Two Factor) e **F5-S06**
(Passkey) — juntos, 20 % do peso do scorecard, hoje em zero.
