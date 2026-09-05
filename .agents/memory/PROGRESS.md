# PROGRESS — Estado da Construção da API

> **Primeiro arquivo que toda sessão de agente lê.** Diz o que já existe, o que é o
> próximo sprint e o que está bloqueado.
>
> Atualizado pelo agente na **etapa 7** de cada sprint, e commitado no mesmo PR.

---

## Estado atual

| Campo                  | Valor                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| **Fase corrente**      | F3 — Identidade (F2 Catálogo concluída)                          |
| **Próximo sprint**     | **F3-S01** — Better Auth: config, plugin e guards                |
| **Última tag**         | `v0.2.0` (preparada)                                             |
| **`gh` CLI**           | ✅ 2.46.0, autenticado como `Cardosofiles`, protocolo SSH (D-33) |
| **`pnpm install`**     | ✅ passa — `allowBuilds` decidido (D-32)                         |
| **Repositório**        | ✅ público `Cardosofiles/cardoso-sound-api` no GitHub            |
| **Branch de trabalho** | `feature/f2s04-modulo-tracks` (default: `develop`)               |
| **CI**                 | ✅ ativo (`.github/workflows/ci.yml`) — check obrigatório        |
| **Banco**              | ✅ Postgres 17 ativo via Docker Compose                          |
| **Última atualização** | 2026-09-04 — F2-S04 concluído                                    |

### ⚠️ O scaffold está VAZIO

**Todo `.ts`, todo arquivo de config e ambos os workflows têm 0 bytes.** A árvore de
diretórios, o `package.json` e a documentação estão completos; o código não. Antes de
assumir que um arquivo tem conteúdo, **verifique**.

Consequência: `pnpm typecheck`, `lint`, `format`, `test` e `build` agora passam (F1-S02).
Comandos `db:*` falham até F1-S03 e F2-S01 configurarem `drizzle.config.ts`.

---

## Roadmap — 19 sprints em 5 fases

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído · 🔴 bloqueado

### F1 — Fundação → tag `v0.1.0`

> Objetivo: o projeto compila, sobe, responde `/health` e tem CI verde.

| Sprint     | Título                                     | Status | PR  | Data       |
| ---------- | ------------------------------------------ | ------ | --- | ---------- |
| **F1-S01** | Repositório e Git Flow                     | ✅     | #1  | 2026-09-03 |
| **F1-S02** | Toolchain TypeScript e qualidade           | ✅     | #2  | 2026-09-03 |
| **F1-S03** | Ambiente: Docker, env e constantes         | ✅     | #5  | 2026-09-04 |
| **F1-S04** | Pipeline de CI                             | ✅     | #7  | 2026-09-04 |
| **F1-S05** | Núcleo: erros, app factory, server, logger | ✅     | #8  | 2026-09-04 |
| **F1-S06** | Plugins de borda, health e Swagger         | ✅     | #11 | 2026-09-04 |

### F2 — Catálogo → tag `v0.2.0`

> Objetivo: catálogo público consultável, populado e testado.

| Sprint     | Título                                   | Status | PR  | Data       |
| ---------- | ---------------------------------------- | ------ | --- | ---------- |
| **F2-S01** | Schema Drizzle e migração inicial        | ✅     | #16 | 2026-09-04 |
| **F2-S02** | Seed do catálogo e harness de integração | ✅     | #17 | 2026-09-04 |
| **F2-S03** | Módulo `artists`                         | ✅     | #19 | 2026-09-04 |
| **F2-S04** | Módulo `tracks` com busca e filtros      | ✅     | #21 | 2026-09-04 |

### F3 — Identidade → tag `v0.3.0`

> Objetivo: cadastro, login (bearer + cookie), perfil, login social e e-mail transacional.

| Sprint     | Título                               | Status | PR  | Data |
| ---------- | ------------------------------------ | ------ | --- | ---- |
| **F3-S01** | Better Auth: config, plugin e guards | ⬜     | —   | —    |
| **F3-S02** | Módulo `users` (`/me`)               | ⬜     | —   | —    |
| **F3-S03** | OAuth social e e-mail transacional   | ⬜     | —   | —    |

### F4 — Biblioteca → tag `v0.4.0`

> Objetivo: playlists, favoritos e suíte E2E completa.

| Sprint     | Título                         | Status | PR  | Data |
| ---------- | ------------------------------ | ------ | --- | ---- |
| **F4-S01** | Módulo `playlists`             | ⬜     | —   | —    |
| **F4-S02** | Módulo `favorites`             | ⬜     | —   | —    |
| **F4-S03** | Suíte E2E dos fluxos completos | ⬜     | —   | —    |

### F5 — Produção → tag `v1.0.0`

> Objetivo: contrato publicado, deploy funcionando, segurança auditada.

| Sprint     | Título                                         | Status | PR  | Data |
| ---------- | ---------------------------------------------- | ------ | --- | ---- |
| **F5-S01** | OpenAPI: export, verificação no CI e polimento | ⬜     | —   | —    |
| **F5-S02** | Deploy na Railway                              | ⬜     | —   | —    |
| **F5-S03** | Hardening, auditoria e release `v1.0.0`        | ⬜     | —   | —    |

---

## Contratos já entregues

Preenchido conforme os sprints avançam — serve para o agente saber o que **já existe**
antes de reimplementar.

| Rota / Símbolo                                                                                         | Sprint | Arquivo                               |
| ------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------- |
| Pagination (`toOffset`, `buildPaginationMeta`)                                                         | F1-S02 | `src/shared/utils/pagination.ts`      |
| `env`, `parseEnv`, `isProduction`, `isTest`, `isDevelopment`                                           | F1-S03 | `src/config/env.ts`                   |
| `APP_NAME`, `API_PREFIX`, `AUTH_PREFIX`, `GENRES`, limites                                             | F1-S03 | `src/config/constants.ts`             |
| Pipeline CI (`ci`), PR template, rulesets `main`/`develop`                                             | F1-S04 | `.github/workflows/ci.yml`            |
| `AppError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError` | F1-S05 | `src/shared/errors/`                  |
| `errorHandlerPlugin` (envelope RFC 7807, 404 handler)                                                  | F1-S05 | `src/plugins/error-handler.plugin.ts` |
| `buildApp()` (factory pura Fastify, Zod type provider, Pino)                                           | F1-S05 | `src/app.ts`                          |
| Bootstrap do servidor e graceful shutdown                                                              | F1-S05 | `src/server.ts`                       |
| R01: `GET /health` (Liveness, não toca no banco)                                                       | F1-S06 | `src/plugins/health.plugin.ts`        |
| R02: `GET /health/ready` (Readiness, faz `SELECT 1`)                                                   | F1-S06 | `src/plugins/health.plugin.ts`        |
| R03: `GET /docs`, `GET /docs/json` (OpenAPI 3.0.3 + Swagger UI)                                        | F1-S06 | `src/plugins/swagger.plugin.ts`       |
| Cliente Drizzle e Pool Postgres (`pool`, `db`, `checkDatabase`, `setPool`)                             | F1-S06 | `src/db/client.ts`                    |
| Plugins de borda e defesa (`helmet`, `cors`, `rate-limit`, `under-pressure`)                           | F1-S06 | `src/plugins/`                        |
| Schemas Drizzle (9 tabelas: `user`, `session`, `account`, `verification`, `artists`, `tracks`, etc.)   | F2-S01 | `src/db/schema/*.schema.ts`           |
| Relações Drizzle ORM (5 relations para `db.query.*` com `with`)                                        | F2-S01 | `src/db/schema/index.ts`              |
| Migração inicial (`0000_*.sql` com `pg_trgm` e 3 índices GIN)                                          | F2-S01 | `drizzle/`                            |
| Runner de migração de produção (`runMigrations()`)                                                     | F2-S01 | `src/db/migrate.ts`                   |
| Harness de integração Testcontainers (`startTestDatabase`, `truncateAll`)                              | F2-S02 | `tests/setup/testcontainers.ts`       |
| Seed idempotente do catálogo musical (`seed`, `SEED_ARTISTS`, `SEED_TRACKS`)                           | F2-S02 | `src/db/seed/`                        |
| R04: `GET /api/v1/artists` (lista paginada com busca e `trackCount`)                                   | F2-S03 | `src/modules/artists/`                |
| R05: `GET /api/v1/artists/:id` (detalhe do artista com faixas `title ASC`)                             | F2-S03 | `src/modules/artists/`                |
| R06: `GET /api/v1/tracks` (lista paginada com busca e filtros)                                         | F2-S04 | `src/modules/tracks/`                 |
| R07: `GET /api/v1/tracks/:id` (detalhe da faixa com `artist` embutido)                                 | F2-S04 | `src/modules/tracks/`                 |
| R08: `GET /api/v1/genres` (lista agregada dos 6 gêneros com `trackCount`)                              | F2-S04 | `src/modules/tracks/`                 |

---

## Bloqueios e pendências

| #      | Item                                                               | Bloqueia                      | Quem resolve                                                                                     |
| ------ | ------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| ~~B1~~ | ~~`gh` CLI não instalado~~                                         | —                             | ✅ **resolvido 2026-09-03** — `gh` 2.46.0, autenticado como `Cardosofiles`, protocolo SSH (D-33) |
| ~~B4~~ | ~~`pnpm install` abortando com `ERR_PNPM_IGNORED_BUILDS`~~         | —                             | ✅ **resolvido 2026-09-03** — `allowBuilds` preenchido (D-32)                                    |
| ~~B2~~ | ~~`.env` vazio, sem `DATABASE_URL`~~                               | —                             | ✅ **resolvido 2026-09-04** em F1-S03 (`.env.example`, validação Zod e docker compose)           |
| ~~B3~~ | ~~`AGENTS.md` e `README.md` contradizem D-01/D-03/D-09/D-10/D-16~~ | —                             | ✅ **resolvido 2026-09-03** em F1-S01                                                            |
| B5     | Token do `gh` sem escopo `workflow`                                | possivelmente F1-S04 e F5-S02 | **Você**, só se um push de workflow for recusado: `gh auth refresh -h github.com -s workflow`    |
| ~~P1~~ | ~~Exigir status check obrigatório `ci` nos rulesets~~              | —                             | ✅ **resolvido 2026-09-04** em F1-S04 (rulesets `protection-develop` e `protection-main`)        |

---

## Como atualizar este arquivo (etapa 7)

1. Trocar o status do sprint para ✅, com número do PR e data.
2. Atualizar **Estado atual**: fase corrente, próximo sprint, última tag.
3. Acrescentar as rotas novas em **Contratos já entregues**.
4. Remover bloqueios resolvidos; acrescentar os que surgiram.
5. Se o sprint gerou decisão global, ela vai em `DECISIONS.md` — **não aqui**.
