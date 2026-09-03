# F1-S06 — Plugins de Borda, Health e Swagger

|                |                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Fase**       | F1 — Fundação · **último sprint da fase**                                                |
| **Branch**     | `feature/f1s06-plugins-de-borda-e-health`                                                |
| **Depende de** | F1-S05                                                                                   |
| **Entrega**    | API sobe com segurança, resiliência, `/health`, `/health/ready` e `/docs` · tag `v0.1.0` |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S06-plugins-de-borda-e-health.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (§9, §10),
                    docs/specs/04-autenticacao-e-seguranca.md (§4),
                    docs/specs/02-modelo-de-dados.md (§6)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fechar a fase de fundação: a API sobe com todos os plugins de borda, expõe health checks
reais contra o banco, e serve documentação OpenAPI. Ao fim, **tag `v0.1.0`**.

### ⚠️ Divisão deliberada de `src/db/`

Este sprint cria **`src/db/client.ts`** e um **`src/db/schema/index.ts` vazio**, porque
`/health/ready` e o `healthCheck` do `under-pressure` precisam de um `pg.Pool` real
(D-20, D-26). As **tabelas** continuam sendo F2-S01.

Justificativa: o pool de conexão é infraestrutura; as tabelas são domínio. Registre isso
como decisão nova em `DECISIONS.md`.

---

## 3. Contratos esperados

### R01 · `GET /health`

```json
{ "status": "ok", "uptime": 1234.5, "version": "1.0.0" }
```

200 sempre. **Não toca no banco.** `uptime` de `process.uptime()`; `version` do `package.json`.

### R02 · `GET /health/ready`

- 200 → `{ "status": "ready", "database": "up" }`
- 503 → `{ "status": "unavailable", "database": "down" }`

Faz `pool.query('SELECT 1')`. **Não usa o envelope de erro** — é status próprio.

### R03 · `GET /docs` — Swagger UI · `GET /docs/json` — OpenAPI cru

### `src/db/client.ts`

```ts
export const pool: pg.Pool;
export const db: NodePgDatabase<typeof schema>;
export type Database = typeof db;
```

Conteúdo normativo na **spec `02` §6**.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
src/plugins/helmet.plugin.ts
src/plugins/cors.plugin.ts
src/plugins/rate-limit.plugin.ts
src/plugins/under-pressure.plugin.ts
src/plugins/swagger.plugin.ts
src/db/client.ts
src/db/schema/index.ts             # barrel VAZIO: `export {};` + comentário
```

### Criar

```
src/plugins/health.plugin.ts
tests/unit/plugins/health.test.ts
tests/integration/health.test.ts
```

### Editar

```
src/app.ts                          # registrar os plugins na ordem da spec 01 §3
src/server.ts                       # fechar o pool no shutdown
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F1-S06.md
```

**Não toque em:** `src/db/schema/*.schema.ts` (F2-S01) · `src/modules/**` ·
`src/shared/errors/**` (pronto em F1-S05) · `.github/**`.

---

## 5. Passo a passo

### 5.1 `src/db/client.ts` e barrel vazio

`src/db/schema/index.ts`:

```ts
// As tabelas entram em F2-S01. Este barrel existe para `drizzle(pool, { schema })`
// funcionar desde F1-S06, quando /health/ready passou a precisar do pool.
export {};
```

`client.ts` conforme spec `02` §6. `db` já é criado com `{ schema }` — vazio agora,
populado em F2-S01 sem nenhuma mudança neste arquivo.

### 5.2 Plugins

Conteúdo normativo de cada um na **spec `04` §4**. Todos registrados com `fastify-plugin`
quando precisarem vazar para o escopo global.

| Plugin           | Cuidado principal                                                               |
| ---------------- | ------------------------------------------------------------------------------- |
| `helmet`         | CSP **desligado** fora de produção, senão quebra o Swagger UI                   |
| `cors`           | `exposedHeaders: ['set-auth-token']` — sem isso o browser não lê o token (D-13) |
| `rate-limit`     | `global: isProduction` (D-19); `allowList` para `/health*`                      |
| `under-pressure` | `healthCheck` faz `SELECT 1` no pool; `exposeStatusRoute: false` (D-26)         |
| `swagger`        | `transform: jsonSchemaTransform` do `fastify-type-provider-zod`                 |

Swagger: título, descrição, versão do `package.json`, tags `Health`/`Auth`/`Catalog`/
`Profile`/`Library`, e `securitySchemes` com `bearerAuth` e `cookieAuth` (spec `03` §10).

### 5.3 `health.plugin.ts`

Duas rotas, ambas com schema Zod de response e `tags: ['Health']`.
`/health/ready` usa a **mesma** função de checagem que o `under-pressure` — exporte-a de
um lugar só e importe nos dois. Duas checagens divergentes é bug esperando acontecer.

```ts
export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

### 5.4 `app.ts` — ordem de registro

```
type provider Zod → error-handler → helmet → cors → rate-limit
→ under-pressure → swagger + swagger-ui → health
```

A ordem importa: o error handler primeiro para capturar falha dos demais; helmet antes de
cors para os headers não serem sobrescritos.

### 5.5 `server.ts`

Acrescente `await pool.end()` no `shutdown`, **depois** de `app.close()` e antes do
`process.exit(0)`.

### 5.6 Tag da fase

Depois do merge do PR em `develop`, siga o procedimento da **spec `06` §6** para
`release/v0.1.0` → `main` → tag `v0.1.0` → back-merge.

> O agente **prepara** a branch de release e abre o PR. O merge e a tag continuam sendo
> seus (D-06).

---

## 6. Casos de teste obrigatórios

### `tests/unit/plugins/health.test.ts` (sem banco, `checkDatabase` dublado)

| #   | Caso                                                | Esperado                                      |
| --- | --------------------------------------------------- | --------------------------------------------- |
| T1  | `GET /health`                                       | 200, `status: 'ok'`, `uptime` numérico > 0    |
| T2  | `GET /health` com o banco fora                      | ainda **200** — liveness não depende do banco |
| T3  | `GET /health/ready` com checagem ok                 | 200, `database: 'up'`                         |
| T4  | `GET /health/ready` com checagem falhando           | **503**, `database: 'down'`                   |
| T5  | `GET /docs/json`                                    | 200, JSON com `openapi` e `paths`             |
| T6  | Headers do helmet presentes                         | `x-content-type-options`, `x-frame-options`   |
| T7  | Preflight `OPTIONS` em rota da API                  | 204 com `access-control-allow-*`              |
| T8  | `set-auth-token` em `access-control-expose-headers` | presente                                      |

### `tests/integration/health.test.ts` (com Postgres do Testcontainers)

| #   | Caso                                      | Esperado              |
| --- | ----------------------------------------- | --------------------- |
| T9  | `/health/ready` contra banco real de pé   | 200, `database: 'up'` |
| T10 | `/health/ready` após derrubar o container | 503                   |

> T9/T10 usam Testcontainers antes de F2-S02 existir. Se o harness ainda não estiver
> pronto, suba o container **dentro deste arquivo de teste** com
> `new PostgreSqlContainer('postgres:17-alpine')` e sem migrações — o `SELECT 1` não
> precisa de tabela. F2-S02 depois extrai isso para `tests/setup/testcontainers.ts`.

---

## 7. Definition of Done

```bash
docker compose up -d
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev
curl -s localhost:3000/health        | jq
curl -s localhost:3000/health/ready  | jq
curl -sI localhost:3000/health       | grep -i x-frame-options
open http://localhost:3000/docs      # Swagger UI carrega sem erro de CSP
docker compose stop postgres
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/health/ready   # 503
docker compose start postgres
```

- [ ] T1–T10 verdes
- [ ] Swagger UI abre e renderiza (prova de que o CSP não o quebrou)
- [ ] `/health/ready` devolve 503 com o Postgres parado e volta a 200 depois
- [ ] `Ctrl+C` fecha app **e** pool, sem processo órfão e sem erro
- [ ] `DECISIONS.md` com a decisão sobre `client.ts` em F1-S06 (§2)
- [ ] PR verde; `release/v0.1.0` preparada e PR para `main` aberto
- [ ] Memória atualizada

---

## 8. Armadilhas conhecidas

1. **CSP do helmet quebra o Swagger UI** com "Refused to execute inline script".
   Por isso `contentSecurityPolicy: false` fora de produção (spec `04` §4).
2. **`under-pressure` com `healthCheck` derruba a API inteira** se o banco cair: ele
   passa a responder 503 em **todas** as rotas. É o comportamento desejado (a API
   realmente não funciona sem banco), mas precisa estar claro — registre no `F1-S06.md`.
3. **`exposeStatusRoute: true` criaria `/status` duplicando `/health/ready`.** Fica `false`.
4. **Rate limit no `/health` derruba o healthcheck da Railway**, que consulta com
   frequência. Por isso o `allowList`.
5. **`jsonSchemaTransform` é obrigatório** no `@fastify/swagger` — sem ele os schemas Zod
   não viram OpenAPI e `/docs` aparece vazio.
6. **`pool.end()` chamado duas vezes lança.** Proteja o `shutdown` contra sinal repetido
   (`process.once`, ou uma flag `isShuttingDown`).
7. **Ler a versão do `package.json` em ESM** exige
   `createRequire(import.meta.url)('../package.json')` ou `resolveJsonModule` + import
   com `with { type: 'json' }`. O tsconfig de F1-S02 tem `resolveJsonModule: true`.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: `src/db/client.ts` criado em F1-S06, não em F2-S01,
  porque `/health/ready` e o `under-pressure` precisam do pool. Registre também o
  comportamento de 503 global do under-pressure.
- **`PROGRESS.md`** — F1-S06 ✅, **fase F1 concluída**, tag `v0.1.0` preparada,
  próximo = F2-S01. Acrescentar R01/R02/R03 em "Contratos já entregues".
- **`F1-S06.md`** — ordem final de registro dos plugins em `app.ts` (F3-S01 vai precisar
  saber onde encaixar o `auth.plugin`).
