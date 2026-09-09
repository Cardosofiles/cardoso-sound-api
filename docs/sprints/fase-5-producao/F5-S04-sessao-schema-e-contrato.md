# F5-S04 — Endurecimento de Sessão, Schema e Contrato

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Fase**       | F5 — Produção · **3º dos 6 sprints de blindagem** (D-49) |
| **Branch**     | `feature/f5s04-sessao-schema-e-contrato`                 |
| **Depende de** | F5-S03                                                   |
| **Entrega**    | GAP-13, GAP-16, GAP-19, GAP-20, GAP-23, GAP-26           |

> **Primeiro sprint da blindagem que gera migração.** Ela é pequena — três índices e uma
> restrição única — mas é a base de que F5-S05 e F5-S06 dependem: as tabelas de 2FA e Passkey
> entram em cima deste schema.
>
> Também é o sprint que fecha a última dívida de **contrato** do projeto: erros de `/api/auth/*`
> passam a trazer o envelope RFC 7807 do resto da API **sem perder** as chaves nativas do
> Better Auth.

---

## 0. Pré-requisitos

Nenhum trabalho humano. Docker rodando (a suíte de integração usa Testcontainers).

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-22 (redaction), D-39 (edição manual de migração), D-40 (schemas Better Auth),
D-44 (ponte Set-Cookie) e D-47 (corridas em tabelas associativas) — as cinco decidem
partes deste sprint.
Leia .agents/memory/F2-S01.md (entregou o schema e a migração inicial que você vai
estender) e .agents/memory/F3-S01.md (entregou a ponte Fastify↔Fetch que você vai
alterar com MUITO cuidado).

Sprint alvo: docs/sprints/fase-5-producao/F5-S04-sessao-schema-e-contrato.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§6.1, §8.4, §8.5, §9),
                    docs/specs/02-modelo-de-dados.md,
                    docs/specs/04-autenticacao-e-seguranca.md (§2, §5)

ANTES de escrever qualquer código, execute a §5.1: confirme a assinatura de
session.cookieCache e de `logger` nas opções de betterAuth() na versão instalada,
e rode `pnpm dlx @better-auth/cli@latest generate` para ver se o schema atual acusa
diferença ANTES de qualquer alteração sua. Reporte as duas coisas.

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

Seis correções, agrupadas por afinidade de arquivo:

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

**Não faz parte deste sprint:** tabelas de 2FA (F5-S05) · tabela de Passkey (F5-S06) · tabela
`rate_limit` (F5-S07) · qualquer alteração de `emailAndPassword`.

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

### 3.3 `auth.plugin.ts` — duas mudanças cirúrgicas

```ts
export function shouldResolveSession(url: string): boolean; // exportada para teste
export function toRfc7807(status: number, rawBody: string): string; // exportada para teste
```

A ponte em si — método, `getSetCookie()`, repasse de headers — **não muda**. D-44 continua
valendo integralmente.

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
```

### Editar

```
src/db/schema/users.schema.ts        # só índices e uniqueIndex (§3.1)
src/modules/auth/auth.config.ts      # session.cookieCache + logger.level
src/modules/auth/auth.plugin.ts      # shouldResolveSession + toRfc7807
src/plugins/swagger.plugin.ts        # sessionCookieName no securityScheme
docs/openapi.json                    # regenerado — o securityScheme MUDA
.agents/memory/PROGRESS.md
.agents/memory/F5-S04.md
```

**Não toque em:** `src/config/env.ts` · `src/app.ts` · `src/plugins/{rate-limit,cors,helmet,under-pressure,error-handler,health}.plugin.ts` ·
`src/modules/{users,playlists,favorites,artists,tracks}/**` · `src/shared/email/**` ·
`drizzle/0000_*.sql` e `drizzle/0001_*.sql` (**migração aplicada nunca se edita** — D-39 autoriza
edição manual da migração **nova**, não das antigas) · `tests/e2e/**`.

> **`DECISIONS.md` não está na lista.** Nenhuma decisão nova é esperada. Se a §5.1 revelar que
> `cookieCache` ou `logger` não existem com essa forma, **pare e reporte**.

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

- [ ] T1–T28 verdes
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

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** Se você precisou decidir algo, **pare e reporte**.
- **`PROGRESS.md`** — F5-S04 ✅, próximo = F5-S05. Acrescente a migração nova em **Contratos já
  entregues**.
- **`F5-S04.md`** — (a) o SQL exato da migração e por que são quatro comandos; (b) como o
  `toRfc7807` trata cada caso, com exemplo de corpo antes e depois — **o time do Flutter lê**;
  (c) se `content-length` estava sendo repassado e o que foi feito; (d) como T24 e T27 foram
  medidos, ou por que a asserção precisou ser degradada.

---

## 10. Depois deste sprint

O schema está pronto para receber as tabelas de 2FA e Passkey, e a sessão saiu do caminho quente.
Todos os **GAPs de severidade MÉDIA e BAIXA** do domínio de sessão e contrato estão fechados.

Restam os dois GAPs ALTOS de funcionalidade ausente: **F5-S05** (Two Factor) e **F5-S06**
(Passkey) — juntos, 20 % do peso do scorecard, hoje em zero.
