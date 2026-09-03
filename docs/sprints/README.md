# Sprints — Roadmap de Execução

**18 sprints · 5 fases · 1 sprint = 1 sessão de agente = 1 PR** (D-23).

Cada arquivo é autossuficiente: traz o prompt de abertura, os contratos exatos, a lista
fechada de arquivos que pode tocar e o critério de pronto. O agente não deve precisar de
mais nada além dele e das specs que ele indicar.

---

## Como usar

1. Abra `.agents/memory/PROGRESS.md` e veja qual é o **próximo sprint**.
2. Abra o arquivo do sprint e copie o bloco **§1 Prompt de abertura**.
3. Cole numa sessão nova do Antigravity. Nada mais.
4. O agente planeja e **espera sua autorização**.
5. Ao fim, ele abre o PR e **para**. Você revisa e faz o merge (D-06).

---

## Roadmap

### F1 — Fundação · `v0.1.0`

> O projeto compila, sobe, responde `/health` e tem CI verde. Nenhuma regra de negócio.

| Sprint | Arquivo                                                                          | Entrega                                                      |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| F1-S01 | [Repositório e Git Flow](fase-1-fundacao/F1-S01-repositorio-e-gitflow.md)        | Repo público, branches, hooks, docs reconciliados            |
| F1-S02 | [Toolchain TypeScript](fase-1-fundacao/F1-S02-toolchain-typescript.md)           | tsconfig, ESLint+boundaries, Prettier, tsup, Vitest          |
| F1-S03 | [Ambiente e configuração](fase-1-fundacao/F1-S03-ambiente-docker-e-config.md)    | Compose, Dockerfile, `.env`, `env.ts`, constantes            |
| F1-S04 | [Pipeline de CI](fase-1-fundacao/F1-S04-pipeline-ci.md)                          | `ci.yml` completo e bloqueante, ruleset ativo                |
| F1-S05 | [Núcleo da aplicação](fase-1-fundacao/F1-S05-nucleo-erros-app-e-logger.md)       | Erros, error-handler, `app.ts`, `server.ts`, logger          |
| F1-S06 | [Plugins de borda e health](fase-1-fundacao/F1-S06-plugins-de-borda-e-health.md) | helmet, cors, rate-limit, under-pressure, swagger, `/health` |

### F2 — Catálogo · `v0.2.0`

> O app lista, busca e toca música. Sem login.

| Sprint | Arquivo                                                                                | Entrega                                |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------- |
| F2-S01 | [Schema e migração inicial](fase-2-catalogo/F2-S01-schema-e-migrations.md)             | 9 tabelas, `pg_trgm`, client Drizzle   |
| F2-S02 | [Seed e harness de integração](fase-2-catalogo/F2-S02-seed-e-harness-de-integracao.md) | 8 artistas / 40 faixas, Testcontainers |
| F2-S03 | [Módulo `artists`](fase-2-catalogo/F2-S03-modulo-artists.md)                           | R04, R05                               |
| F2-S04 | [Módulo `tracks`](fase-2-catalogo/F2-S04-modulo-tracks.md)                             | R06, R07, R08 + busca `pg_trgm`        |

### F3 — Identidade · `v0.3.0`

> Cadastro, login por bearer e cookie, perfil.

| Sprint | Arquivo                                                    | Entrega                            |
| ------ | ---------------------------------------------------------- | ---------------------------------- |
| F3-S01 | [Better Auth](fase-3-identidade/F3-S01-better-auth.md)     | R09–R12, `requireAuth`, decorators |
| F3-S02 | [Módulo `users`](fase-3-identidade/F3-S02-modulo-users.md) | R13, R14, R15                      |

### F4 — Biblioteca · `v0.4.0`

> O usuário monta playlists e favorita faixas.

| Sprint | Arquivo                                                            | Entrega       |
| ------ | ------------------------------------------------------------------ | ------------- |
| F4-S01 | [Módulo `playlists`](fase-4-biblioteca/F4-S01-modulo-playlists.md) | R16–R22       |
| F4-S02 | [Módulo `favorites`](fase-4-biblioteca/F4-S02-modulo-favorites.md) | R23, R24, R25 |
| F4-S03 | [Suíte E2E](fase-4-biblioteca/F4-S03-suite-e2e.md)                 | E1–E9         |

### F5 — Produção · `v1.0.0`

> Contrato publicado, deploy no ar, segurança auditada.

| Sprint | Arquivo                                                              | Entrega                                  |
| ------ | -------------------------------------------------------------------- | ---------------------------------------- |
| F5-S01 | [OpenAPI](fase-5-producao/F5-S01-openapi-e-docs.md)                  | `openapi.json` + check no CI             |
| F5-S02 | [Deploy na Railway](fase-5-producao/F5-S02-deploy-railway.md)        | Dockerfile, `railway.json`, `deploy.yml` |
| F5-S03 | [Hardening e release](fase-5-producao/F5-S03-hardening-e-release.md) | Auditoria, README final, `v1.0.0`        |

---

## Dependências entre sprints

```
F1-S01 ─▶ F1-S02 ─▶ F1-S03 ─▶ F1-S04 ─▶ F1-S05 ─▶ F1-S06 ─┐
                                                            │
F2-S01 ─▶ F2-S02 ─┬─▶ F2-S03 ─┐                            │
                  └─▶ F2-S04 ─┤◀───────────────────────────┘
                              │
                     F3-S01 ─▶ F3-S02 ─┐
                                        │
                          F4-S01 ─┬─────┤
                          F4-S02 ─┴─▶ F4-S03
                                        │
                          F5-S01 ─▶ F5-S02 ─▶ F5-S03
```

**A ordem é sequencial e não deve ser antecipada.** As únicas folgas: F2-S03 e F2-S04 são
independentes entre si (mas ambos dependem de F2-S02); F4-S01 e F4-S02 idem.

---

## Regras que valem para todos os sprints

| Regra                                                                 | Referência   |
| --------------------------------------------------------------------- | ------------ |
| Ler `PROGRESS.md` e `DECISIONS.md` antes de tudo                      | spec `07` §2 |
| Planejar e **esperar autorização** antes de codar                     | spec `07` §4 |
| Só tocar arquivos do **blast radius**                                 | spec `07` §5 |
| `typecheck → lint → format → test → build` antes de commitar          | spec `05` §7 |
| PR com o corpo padrão; **agente nunca faz merge**                     | spec `06` §4 |
| CI vermelho: 3 tentativas, depois **para e reporta**                  | spec `06` §5 |
| Atualizar `DECISIONS.md`, `PROGRESS.md` e `F<n>-S<nn>.md` no mesmo PR | spec `07` §8 |
| Parar e perguntar diante de ambiguidade                               | spec `07` §9 |
