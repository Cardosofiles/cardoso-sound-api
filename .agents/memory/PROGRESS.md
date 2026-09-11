# PROGRESS — Estado da Construção da API

> **Primeiro arquivo que toda sessão de agente lê.** Diz o que já existe, o que é o
> próximo sprint e o que está bloqueado.
>
> Atualizado pelo agente na **etapa 7** de cada sprint, e commitado no mesmo PR.

---

## Estado atual

| Campo                  | Valor                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| **Fase corrente**      | F5 — Produção (em andamento)                                       |
| **Próximo sprint**     | **F5-S08** — Deploy na Railway                                     |
| **Última tag**         | `v0.4.0` (preparada)                                               |
| **`gh` CLI**           | ✅ 2.46.0, autenticado como `Cardosofiles`, protocolo SSH (D-33)   |
| **`pnpm install`**     | ✅ passa — `allowBuilds` decidido (D-32)                           |
| **Repositório**        | ✅ público `Cardosofiles/cardoso-sound-api` no GitHub              |
| **Branch de trabalho** | `feature/f5s10-vinculo-de-contas-sociais` (default: `develop`)     |
| **CI**                 | ✅ ativo (`.github/workflows/ci.yml`) — check obrigatório          |
| **Banco**              | ✅ Postgres 17 ativo via Docker Compose                            |
| **Última atualização** | 2026-09-11 — F5-S10 concluído: Vínculo de contas sociais (R46–R48) |

> ✅ **Auditoria de segurança encerrada (2026-09-11).** Todos os **27 GAPs** de `docs/issue/AUTHENTICATION.md`
> foram integralmente fechados nos sprints F5-S02 … F5-S07 (GAP-11, GAP-12 e GAP-18 entregues em F5-S07).
> O rate limiting do Better Auth está persistido no PostgreSQL (`storage: 'database'`), a chave do Fastify
> rate limit combina IP e hash de token sem `req.user`, e as origens de produção rejeitam coringas.

### O que já tem código e o que ainda está vazio

O scaffold **não** está mais vazio: F1, F2, F3 e F4 estão integralmente implementadas e os cinco portões
(`typecheck`, `lint`, `format`, `test`, `build`) passam com 264 testes verdes. Ainda assim, **verifique que um
arquivo tem conteúdo antes de assumir que tem** — vários continuam com 0 bytes.

**Implementado:** toolchain e portões · Docker Compose e `src/config/env.ts` · CI ·
hierarquia `AppError`, app factory, logger · plugins de borda, `/health`, Swagger ·
schema Drizzle completo com índices GIN `pg_trgm` · seed idempotente · harness
Testcontainers · módulos `artists`, `tracks`, `auth` (Better Auth, e-mail e social),
`users` (`/me`), templates de e-mail e transporte de mensageria Resend/Memory,
`playlists` (CRUD privado com isolamento por WHERE, R16–R22),
`favorites` (favoritar faixas com PK composta e isolamento por WHERE, R23–R25),
suíte E2E dos fluxos completos (E1–E15, 5 specs via `app.inject()` com container singleton, D-48).

**Ainda com 0 bytes, aguardando seus sprints:**
`Dockerfile`, `railway.json`, `.github/workflows/deploy.yml` (F5-S08).

---

## Roadmap — 25 sprints em 5 fases

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
| **F2-S04** | Módulo `tracks` com busca e filtros      | ✅     | #20 | 2026-09-04 |

### F3 — Identidade → tag `v0.3.0`

> Objetivo: cadastro, login (bearer + cookie), perfil, login social e e-mail transacional.

| Sprint     | Título                               | Status | PR  | Data       |
| ---------- | ------------------------------------ | ------ | --- | ---------- |
| **F3-S01** | Better Auth: config, plugin e guards | ✅     | #22 | 2026-09-05 |
| **F3-S02** | Módulo `users` (`/me`)               | ✅     | #23 | 2026-09-05 |
| **F3-S03** | OAuth social e e-mail transacional   | ✅     | #24 | 2026-09-05 |

### F4 — Biblioteca → tag `v0.4.0`

> Objetivo: playlists, favoritos e suíte E2E completa.

| Sprint     | Título                         | Status | PR  | Data       |
| ---------- | ------------------------------ | ------ | --- | ---------- |
| **F4-S01** | Módulo `playlists`             | ✅     | #25 | 2026-09-06 |
| **F4-S02** | Módulo `favorites`             | ✅     | #26 | 2026-09-06 |
| **F4-S03** | Suíte E2E dos fluxos completos | ✅     | #27 | 2026-09-08 |

### F5 — Produção → tag `v1.0.0`

> Objetivo: contrato publicado, **os 27 GAPs da auditoria de segurança fechados**, deploy
> funcionando, segurança auditada.
>
> **Renumerada em 2026-09-09 por D-49.** A auditoria de `docs/issue/AUTHENTICATION.md` levantou
> 27 GAPs, um deles crítico (rate limit global desligado justamente em produção). Seis sprints de
> blindagem passaram a rodar **antes** do deploy. O antigo `F5-S02` (deploy) é agora `F5-S08`; o
> antigo `F5-S03` (release) é agora `F5-S09`. Spec normativa:
> `docs/specs/08-blindagem-de-seguranca.md`; rastreabilidade GAP × sprint na §10 dela.
>
> **`F5-S10` acrescentado em 2026-09-09 por D-58** e roda **entre `F5-S07` e `F5-S08`** — o
> número é identidade, não ordem. Fecha as três rotas de vínculo de conta social que a coringa
> já responde sem contrato nem teste. Depende do índice `account_provider_account_unique` de
> F5-S04 (GAP-16).

| Sprint     | Título                                         | Status | PR  | Data       | GAPs                           |
| ---------- | ---------------------------------------------- | ------ | --- | ---------- | ------------------------------ |
| **F5-S01** | OpenAPI: export, verificação no CI e polimento | ✅     | #28 | 2026-09-09 | —                              |
| **F5-S02** | Blindagem de borda e rate limiting             | ✅     | #29 | 2026-09-09 | 01, 04, 05, 06, 10, 17, 21, 27 |
| **F5-S03** | Recuperação de conta, anti-enumeração e senha  | ✅     | #30 | 2026-09-09 | 07, 08, 14, 15, 22, 24, 25     |
| **F5-S04** | Endurecimento de sessão, schema e contrato     | ✅     | #32 | 2026-09-09 | 13, 16, 19, 20, 23, 26         |
| **F5-S05** | Two Factor: TOTP, OTP e backup codes           | ✅     | #33 | 2026-09-10 | 02, 09 (parte 2FA)             |
| **F5-S06** | Passkey (WebAuthn / FIDO2)                     | ✅     | #34 | 2026-09-10 | 03, 09 (parte passkey)         |
| **F5-S07** | Rate limit distribuído e origens confiáveis    | ✅     | #35 | 2026-09-11 | 11, 12, 18                     |
| **F5-S10** | Vínculo de contas sociais (R46–R48)            | ✅     | #36 | 2026-09-11 | — (D-58)                       |
| **F5-S08** | Deploy na Railway                              | ⬜     | —   | —          | —                              |
| **F5-S09** | Hardening, auditoria e release `v1.0.0`        | ⬜     | —   | —          | portão dos 27                  |

---

## Contratos já entregues

Preenchido conforme os sprints avançam — serve para o agente saber o que **já existe**
antes de reimplementar.

| Rota / Símbolo                                                                                                                                                                 | Sprint | Arquivo                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------- |
| Pagination (`toOffset`, `buildPaginationMeta`)                                                                                                                                 | F1-S02 | `src/shared/utils/pagination.ts`                                     |
| `env`, `parseEnv`, `isProduction`, `isTest`, `isDevelopment`                                                                                                                   | F1-S03 | `src/config/env.ts`                                                  |
| `APP_NAME`, `API_PREFIX`, `AUTH_PREFIX`, `GENRES`, limites                                                                                                                     | F1-S03 | `src/config/constants.ts`                                            |
| Pipeline CI (`ci`), PR template, rulesets `main`/`develop`                                                                                                                     | F1-S04 | `.github/workflows/ci.yml`                                           |
| `AppError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`                                                                         | F1-S05 | `src/shared/errors/`                                                 |
| `errorHandlerPlugin` (envelope RFC 7807, 404 handler)                                                                                                                          | F1-S05 | `src/plugins/error-handler.plugin.ts`                                |
| `buildApp()` (factory pura Fastify, Zod type provider, Pino)                                                                                                                   | F1-S05 | `src/app.ts`                                                         |
| Bootstrap do servidor e graceful shutdown                                                                                                                                      | F1-S05 | `src/server.ts`                                                      |
| R01: `GET /health` (Liveness, não toca no banco)                                                                                                                               | F1-S06 | `src/plugins/health.plugin.ts`                                       |
| R02: `GET /health/ready` (Readiness, faz `SELECT 1`)                                                                                                                           | F1-S06 | `src/plugins/health.plugin.ts`                                       |
| R03: `GET /docs`, `GET /docs/json` (OpenAPI 3.0.3 + Swagger UI)                                                                                                                | F1-S06 | `src/plugins/swagger.plugin.ts`                                      |
| Cliente Drizzle e Pool Postgres (`pool`, `db`, `checkDatabase`, `setPool`)                                                                                                     | F1-S06 | `src/db/client.ts`                                                   |
| Plugins de borda e defesa (`helmet`, `cors`, `rate-limit`, `under-pressure`)                                                                                                   | F1-S06 | `src/plugins/`                                                       |
| Schemas Drizzle (9 tabelas: `user`, `session`, `account`, `verification`, `artists`, `tracks`, etc.)                                                                           | F2-S01 | `src/db/schema/*.schema.ts`                                          |
| Relações Drizzle ORM (5 relations para `db.query.*` com `with`)                                                                                                                | F2-S01 | `src/db/schema/index.ts`                                             |
| Migração inicial (`0000_*.sql` com `pg_trgm` e 3 índices GIN)                                                                                                                  | F2-S01 | `drizzle/`                                                           |
| Runner de migração de produção (`runMigrations()`)                                                                                                                             | F2-S01 | `src/db/migrate.ts`                                                  |
| Harness de integração Testcontainers (`startTestDatabase`, `truncateAll`)                                                                                                      | F2-S02 | `tests/setup/testcontainers.ts`                                      |
| Seed idempotente do catálogo musical (`seed`, `SEED_ARTISTS`, `SEED_TRACKS`)                                                                                                   | F2-S02 | `src/db/seed/`                                                       |
| R04: `GET /api/v1/artists` (lista paginada com busca e `trackCount`)                                                                                                           | F2-S03 | `src/modules/artists/`                                               |
| R05: `GET /api/v1/artists/:id` (detalhe do artista com faixas `title ASC`)                                                                                                     | F2-S03 | `src/modules/artists/`                                               |
| R06: `GET /api/v1/tracks` (lista paginada com busca e filtros)                                                                                                                 | F2-S04 | `src/modules/tracks/`                                                |
| R07: `GET /api/v1/tracks/:id` (detalhe da faixa com `artist` embutido)                                                                                                         | F2-S04 | `src/modules/tracks/`                                                |
| R08: `GET /api/v1/genres` (lista agregada dos 6 gêneros com `trackCount`)                                                                                                      | F2-S04 | `src/modules/tracks/`                                                |
| R09: `POST /api/auth/sign-up/email` (cadastro com e-mail/senha, bearer token e cookie)                                                                                         | F3-S01 | `src/modules/auth/`                                                  |
| R10: `POST /api/auth/sign-in/email` (autenticação por e-mail/senha)                                                                                                            | F3-S01 | `src/modules/auth/`                                                  |
| R11: `POST /api/auth/sign-out` (invalidação de sessão)                                                                                                                         | F3-S01 | `src/modules/auth/`                                                  |
| R12: `GET /api/auth/get-session` (resolução de sessão ativa por bearer token ou cookie)                                                                                        | F3-S01 | `src/modules/auth/`                                                  |
| Decorators `request.user` / `request.session` e guard `fastify.requireAuth`                                                                                                    | F3-S01 | `src/modules/auth/auth.plugin.ts`                                    |
| Helper E2E `signUpAndGetToken` (registro de usuário e extração de Bearer token)                                                                                                | F3-S01 | `tests/e2e/helpers/auth.ts`                                          |
| Migração `0001_early_blazing_skull.sql` (adição de `account.issuer` para Better Auth v1.7.2)                                                                                   | F3-S01 | `drizzle/`                                                           |
| R13: `GET /api/v1/me` (perfil do usuário autenticado com 5 chaves estritas)                                                                                                    | F3-S02 | `src/modules/users/`                                                 |
| R14: `PATCH /api/v1/me` (atualização de nome/avatar com rejeição de corpo vazio)                                                                                               | F3-S02 | `src/modules/users/`                                                 |
| R15: `DELETE /api/v1/me` (exclusão transacional da conta com expurgo em cascata)                                                                                               | F3-S02 | `src/modules/users/`                                                 |
| R26: `POST /api/auth/sign-in/social` (início de fluxo OAuth com Google, GitHub ou Facebook)                                                                                    | F3-S03 | `src/modules/auth/`                                                  |
| R27: `GET /api/auth/callback/:provider` (retorno do provedor OAuth com geração de sessão/tokens)                                                                               | F3-S03 | `src/modules/auth/`                                                  |
| R28: `POST /api/auth/send-verification-email` (disparo idempotente de e-mail de verificação)                                                                                   | F3-S03 | `src/modules/auth/`                                                  |
| R29: `GET /api/auth/verify-email` (consumo de token descartável e marcação de titularidade de e-mail)                                                                          | F3-S03 | `src/modules/auth/`                                                  |
| R30: `POST /api/auth/forget-password` (solicitação segura de link de recuperação de senha)                                                                                     | F3-S03 | `src/modules/auth/`                                                  |
| R31: `POST /api/auth/reset-password` (redefinição de senha com token temporário descartável)                                                                                   | F3-S03 | `src/modules/auth/`                                                  |
| Mailer e Templates (`memoryMailer`, `resendMailer`, `verificationEmail`, `resetPasswordEmail`)                                                                                 | F3-S03 | `src/shared/email/`                                                  |
| R16: `POST /api/v1/playlists` (criação de playlist privada com limite de 50)                                                                                                   | F4-S01 | `src/modules/playlists/`                                             |
| R17: `GET /api/v1/playlists` (listagem paginada de playlists do usuário com `trackCount`)                                                                                      | F4-S01 | `src/modules/playlists/`                                             |
| R18: `GET /api/v1/playlists/:id` (detalhe da playlist com faixas `addedAt ASC`, isolamento por WHERE)                                                                          | F4-S01 | `src/modules/playlists/`                                             |
| R19: `PATCH /api/v1/playlists/:id` (atualização de nome/descrição, rejeita corpo vazio)                                                                                        | F4-S01 | `src/modules/playlists/`                                             |
| R20: `DELETE /api/v1/playlists/:id` (exclusão transacional com expurgo em cascata)                                                                                             | F4-S01 | `src/modules/playlists/`                                             |
| R21: `POST /api/v1/playlists/:id/tracks` (adição idempotente com limite de 500 faixas)                                                                                         | F4-S01 | `src/modules/playlists/`                                             |
| R22: `DELETE /api/v1/playlists/:id/tracks/:trackId` (remoção de faixa da playlist)                                                                                             | F4-S01 | `src/modules/playlists/`                                             |
| R23: `GET /api/v1/favorites` (listagem paginada de favoritos ordenados por `favoritedAt DESC`)                                                                                 | F4-S02 | `src/modules/favorites/`                                             |
| R24: `POST /api/v1/favorites/:trackId` (adição aos favoritos com `FavoriteItem` e 409 em duplicidade)                                                                          | F4-S02 | `src/modules/favorites/`                                             |
| R25: `DELETE /api/v1/favorites/:trackId` (remoção de favorito com isolamento por usuário no WHERE)                                                                             | F4-S02 | `src/modules/favorites/`                                             |
| Suíte E2E Completa (E1–E15: auth, catálogo, playlists, favoritos e lifecycle)                                                                                                  | F4-S03 | `tests/e2e/specs/`                                                   |
| Helper E2E `buildTestApp()` com container singleton efêmero (D-48)                                                                                                             | F4-S03 | `tests/e2e/helpers/app.ts`                                           |
| Contrato OpenAPI 3.0.3 versionado (`docs/openapi.json`) e verificação no CI (D-21)                                                                                             | F5-S01 | `scripts/export-openapi.ts`                                          |
| Suíte de conformidade de contrato OpenAPI (T1–T12)                                                                                                                             | F5-S01 | `tests/integration/openapi.test.ts`                                  |
| Predicado `buildTrustProxy` e utilitário `isTrustedProxy` com memo de BlockList (D-60)                                                                                         | F5-S02 | `src/shared/utils/client-ip.ts`                                      |
| Regras de rate limit de autenticação em 8 endpoints (`AUTH_RATE_LIMIT_RULES`) (GAP-05/06)                                                                                      | F5-S02 | `src/modules/auth/auth.config.ts`                                    |
| Utilitário de sanitização e truncagem de Request ID `resolveRequestId` (GAP-27)                                                                                                | F5-S02 | `src/shared/utils/request-id.ts`                                     |
| Suíte de testes unitários e de integração de borda e rate limit (T1–T40)                                                                                                       | F5-S02 | `tests/unit/**`, `tests/integration/**`                              |
| Verificação obrigatória de e-mail e anti-enumeração genérica no cadastro (GAP-08/14, D-51)                                                                                     | F5-S03 | `src/modules/auth/auth.config.ts`                                    |
| Revogação de sessões ativas pós-reset de senha no banco de dados (GAP-07, D-52)                                                                                                | F5-S03 | `src/modules/auth/auth.config.ts`                                    |
| Política de bloqueio offline de senhas fracas e limite de 128 caracteres (GAP-15)                                                                                              | F5-S03 | `src/shared/security/weak-passwords.ts`                              |
| Escape estrito de atributos HTML em templates de e-mail (`escapeHtmlAttribute`) (GAP-22)                                                                                       | F5-S03 | `src/shared/email/templates.ts`                                      |
| Mailer com logger injetado sem pino() local e sem vazamento de URLs ou destinatários (GAP-25, D-57)                                                                            | F5-S03 | `src/shared/email/mailer.ts`                                         |
| Suíte de testes e E2E helper para recuperação de conta, anti-enumeração e senha (T1–T32)                                                                                       | F5-S03 | `tests/integration/**`, `tests/unit/**`                              |
| Migração `0002_oval_talisman.sql` (4 índices: `account_user_id_idx`, `account_provider_account_unique`, `session_user_id_idx`, `verification_identifier_idx`) (GAP-16, GAP-19) | F5-S04 | `drizzle/`                                                           |
| Curto-circuito de sessão em `/health` e `/api/auth` (`shouldResolveSession`) e `cookieCache` 5 min (GAP-13)                                                                    | F5-S04 | `src/modules/auth/auth.plugin.ts`, `src/modules/auth/auth.config.ts` |
| Envelope de erro RFC 7807 aditivo em rotas Better Auth (`toRfc7807`) com remoção de `content-length` antigo (GAP-26)                                                           | F5-S04 | `src/modules/auth/auth.plugin.ts`                                    |
| Injeção de `request.ip` validado nos dois call sites da ponte Better Auth (`toFetchHeaders`) (R-01)                                                                            | F5-S04 | `src/modules/auth/auth.plugin.ts`                                    |
| Predicado dinâmico de `sessionCookieName` para OpenAPI e Swagger (GAP-20)                                                                                                      | F5-S04 | `src/plugins/swagger.plugin.ts`                                      |
| Suíte de testes unitários e de integração de sessão, schema, envelope e IP real (T1–T33)                                                                                       | F5-S04 | `tests/unit/**`, `tests/integration/**`                              |
| Migração `0003_demonic_kinsey_walden.sql` (`user.twoFactorEnabled` e tabela `twoFactor` com cascade) (GAP-02, GAP-09)                                                          | F5-S05 | `drizzle/`                                                           |
| R32: `POST /api/auth/two-factor/enable` (geração de segredo TOTP e backup codes)                                                                                               | F5-S05 | `src/modules/auth/`                                                  |
| R33: `POST /api/auth/two-factor/verify-totp` (confirmação e verificação de código TOTP de 6 dígitos)                                                                           | F5-S05 | `src/modules/auth/`                                                  |
| R34: `POST /api/auth/two-factor/disable` (desativação de 2FA mediante confirmação de senha)                                                                                    | F5-S05 | `src/modules/auth/`                                                  |
| R35: `POST /api/auth/two-factor/generate-backup-codes` (regeneração de 10 códigos de backup descartáveis)                                                                      | F5-S05 | `src/modules/auth/`                                                  |
| R36: `POST /api/auth/two-factor/verify-backup-code` (autenticação de emergência com código de uso único)                                                                       | F5-S05 | `src/modules/auth/`                                                  |
| R37: `POST /api/auth/two-factor/send-otp` (disparo de OTP de 6 dígitos por e-mail no desafio 2FA)                                                                              | F5-S05 | `src/modules/auth/`                                                  |
| R38: `POST /api/auth/two-factor/verify-otp` (validação de OTP de e-mail no desafio 2FA)                                                                                        | F5-S05 | `src/modules/auth/`                                                  |
| R39: Template `twoFactorOtpEmail` e envio de OTP por e-mail em texto puro sem links (D-53)                                                                                     | F5-S05 | `src/shared/email/templates.ts`                                      |
| Suíte de testes unitários e de integração de 2FA, lockout e rate-limiting (T1–T28)                                                                                             | F5-S05 | `tests/unit/**`, `tests/integration/**`                              |
| Migração `0004_eager_argent.sql` (tabela `passkey` com 11 colunas, `credential_id` unique, `aaguid`, FK `user_id` cascade)                                                     | F5-S06 | `drizzle/`                                                           |
| R41: `GET /api/auth/passkey/generate-register-options` (geração de challenge para registro de Passkey)                                                                         | F5-S06 | `src/modules/auth/`                                                  |
| R42: `POST /api/auth/passkey/verify-registration` (verificação de atestação e persistência da credencial FIDO2)                                                                | F5-S06 | `src/modules/auth/`                                                  |
| R43: `GET /api/auth/passkey/generate-authenticate-options` (geração de challenge de autenticação sem sessão)                                                                   | F5-S06 | `src/modules/auth/`                                                  |
| R44: `POST /api/auth/passkey/verify-authentication` / `POST /api/auth/sign-in/passkey` (asserção WebAuthn e login)                                                             | F5-S06 | `src/modules/auth/`                                                  |
| R45: `GET /api/auth/passkey/list-user-passkeys`, `POST /api/auth/passkey/delete-passkey`, `POST /api/auth/passkey/update-passkey` (gerenciamento privado)                      | F5-S06 | `src/modules/auth/`                                                  |
| Suíte de testes unitários e de integração de Passkey e WebAuthn (T1–T24)                                                                                                       | F5-S06 | `tests/unit/**`, `tests/integration/**`                              |
| Migração `0005_fearless_sinister_six.sql` (tabela `rate_limit` com `key` unique e `last_request` bigint mode number) (GAP-12)                                                  | F5-S07 | `drizzle/`                                                           |
| Rate limit Better Auth persistido em banco relacional (`storage: 'database'`) (GAP-12)                                                                                         | F5-S07 | `src/modules/auth/auth.config.ts`                                    |
| Chave estrita de rate limit sem `req.user` (`rateLimitKeyGenerator` e `extractSessionToken`) (GAP-11)                                                                          | F5-S07 | `src/plugins/rate-limit.plugin.ts`                                   |
| Seam de produção para Redis com fail-closed (`createRedisClient`) (D-55)                                                                                                       | F5-S07 | `src/plugins/rate-limit.plugin.ts`                                   |
| Endurecimento de origens (`CORS_ORIGIN` e `MOBILE_DEEP_LINK` sem coringas em prod) (GAP-18)                                                                                    | F5-S07 | `src/config/env.ts`                                                  |
| Suíte de testes unitários e de integração de rate limit distribuído e origens (T1–T26)                                                                                         | F5-S07 | `tests/unit/**`, `tests/integration/**`                              |
| R46: `GET /api/auth/list-accounts` (listagem isolada de contas vinculadas ao usuário autenticado, array cru)                                                                   | F5-S10 | `src/modules/auth/auth.config.ts`                                    |
| R47: `POST /api/auth/link-social` (iniciação de vínculo de provedores confiáveis Google/GitHub com e-mails distintos)                                                          | F5-S10 | `src/modules/auth/auth.config.ts`                                    |
| R48: `POST /api/auth/unlink-account` (desvinculação com fresh session de 24h e proteção de última conta)                                                                       | F5-S10 | `src/modules/auth/auth.config.ts`                                    |
| Suíte de testes unitários e de integração de vínculo de contas e freshAge (T1–T18)                                                                                             | F5-S10 | `tests/unit/**`, `tests/integration/**`                              |

---

## Bloqueios e pendências

| #      | Item                                                                                                                                                              | Bloqueia                      | Quem resolve                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~B1~~ | ~~`gh` CLI não instalado~~                                                                                                                                        | —                             | ✅ **resolvido 2026-09-03** — `gh` 2.46.0, autenticado como `Cardosofiles`, protocolo SSH (D-33)                                                            |
| ~~B4~~ | ~~`pnpm install` abortando com `ERR_PNPM_IGNORED_BUILDS`~~                                                                                                        | —                             | ✅ **resolvido 2026-09-03** — `allowBuilds` preenchido (D-32)                                                                                               |
| ~~B2~~ | ~~`.env` vazio, sem `DATABASE_URL`~~                                                                                                                              | —                             | ✅ **resolvido 2026-09-04** em F1-S03 (`.env.example`, validação Zod e docker compose)                                                                      |
| ~~B3~~ | ~~`AGENTS.md` e `README.md` contradizem D-01/D-03/D-09/D-10/D-16~~                                                                                                | —                             | ✅ **resolvido 2026-09-03** em F1-S01                                                                                                                       |
| B5     | Token do `gh` sem escopo `workflow`                                                                                                                               | possivelmente F1-S04 e F5-S08 | **Você**, só se um push de workflow for recusado: `gh auth refresh -h github.com -s workflow`                                                               |
| ~~P1~~ | ~~Exigir status check obrigatório `ci` nos rulesets~~                                                                                                             | —                             | ✅ **resolvido 2026-09-04** em F1-S04 (rulesets `protection-develop` e `protection-main`)                                                                   |
| ~~P2~~ | ~~**27 GAPs de segurança abertos** (`docs/issue/AUTHENTICATION.md`) — 1 crítico~~                                                                                 | —                             | ✅ **resolvido 2026-09-11** em F5-S07 — todos os 27 GAPs integralmente fechados (PR #35)                                                                    |
| P3     | Topologia real da borda da Railway — **`TRUSTED_PROXIES` (CIDRs) e `TRUST_PROXY_HOPS` (nº de saltos)**, as duas do D-50                                           | boot em produção              | **Você**, ao configurar as Railway Variables em F5-S08. F5-S02 já valida a ausência das duas no boot. Ver a nota abaixo sobre o valor de `TRUST_PROXY_HOPS` |
| ~~P6~~ | ~~Achado **R-01** — a ponte do Better Auth resolve o IP só por header; `session.ip_address` e as 8 regras de rate limit de auth são falsificáveis fora da borda~~ | —                             | ✅ **resolvido 2026-09-09** em F5-S04 (§3.3, §5.7, T29–T33, PR #32)                                                                                         |
| P4     | Produção restrita a **réplica única** até `RATE_LIMIT_REDIS_URL` existir (D-55)                                                                                   | escalar horizontalmente       | **Você**, quando houver necessidade. F5-S08 fixa `replicas: 1` e registra no runbook                                                                        |
| P5     | `tsup` corrigido para emitir a árvore completa (`entry: ['src/**/*.ts']`) — o artefato de produção não iniciava; consequência do D-35 estava violada desde F1-S02 | —                             | ✅ **resolvido 2026-09-09** em F5-S02                                                                                                                       |

> **Nota sobre P3 — como escolher `TRUST_PROXY_HOPS` (medido em 2026-09-09).** O predicado do D-60
> valida **cada salto** contra `TRUSTED_PROXIES`, então os dois erros não são simétricos:
>
> - **Superestimar é seguro.** `HOPS=5` com um proxy real não afrouxa nada — o salto seguinte já
>   falha na checagem de CIDR e a cadeia é truncada ali.
> - **Subestimar colapsa os buckets.** Com `HOPS=1` e dois proxies reais à frente, `req.ip` vira o
>   IP do segundo proxy para **todos** os clientes: o limitador global cai num bucket único e o
>   primeiro usuário ativo consome os 100/min de todo mundo. É a Armadilha §8.1 da spec `08` pela
>   porta dos fundos.
>
> Na dúvida entre dois valores, **escolha o maior**. E confira o resultado em produção: `req.ip` nos
> logs do Pino tem de ser o IP do cliente, nunca um endereço da faixa em `TRUSTED_PROXIES`.
>
> **Depois de F5-S04 isso fica mais carregado ainda:** com R-01 corrigido, a ponte passa `req.ip`
> ao Better Auth. Se `req.ip` cair **dentro** de `TRUSTED_PROXIES` por causa de um `HOPS`
> subestimado, o resolvedor devolve `null` e o limitador de autenticação inteiro colapsa na chave
> compartilhada `no-trusted-ip|<path>` — medido em `@better-auth/core@1.7.2`.

---

## Como atualizar este arquivo (etapa 7)

1. Trocar o status do sprint para ✅, com número do PR e data.
2. Atualizar **Estado atual**: fase corrente, próximo sprint, última tag.
3. Acrescentar as rotas novas em **Contratos já entregues**.
4. Remover bloqueios resolvidos; acrescentar os que surgiram.
5. Se o sprint gerou decisão global, ela vai em `DECISIONS.md` — **não aqui**.
