# Sprints — Roadmap de Execução

**25 sprints escritos · 7 fases · 1 sprint = 1 sessão de agente = 1 PR** (D-23).

> **O roadmap foi reestruturado em 2026-09-11** (D-64): sete fases, não cinco. A **F5 encerrou-se
> como fase de autenticação e blindagem** e fecha em `v0.5.0`. O deploy saiu dela e virou
> **`F7-S01`**; o release `v1.0.0` virou **`F7-S02`**. Entre as duas entrou a **F6**, que tira o
> catálogo do SoundHelix e do Unsplash e o põe num bucket Cloudflare R2 próprio (D-65…D-70).
> **A F7 é a última fase do projeto.**
>
> Consequência para quem procura arquivo: `F5-S08-deploy-railway.md` agora é
> [`fase-7-deploy/F7-S01-deploy-railway.md`](fase-7-deploy/F7-S01-deploy-railway.md), e o antigo
> `F5-S09-hardening-e-release.md` **não existe mais** — o que ele entregava (checklist da spec `08`
> §9, auditoria final, README reconciliado, `v1.0.0`) é o escopo de `F7-S02`, ainda a escrever.
>
> **Histórico.** A Fase 5 já tinha sido renumerada em 2026-09-09 (D-49): a auditoria de
> [`docs/issue/AUTHENTICATION.md`](../issue/AUTHENTICATION.md) levantou 27 GAPs — um crítico — e
> seis sprints de blindagem passaram a rodar **antes** do deploy, porque não se coloca em produção
> uma aplicação com rate limit desligado e bypass conhecido. A spec normativa da blindagem é
> [`docs/specs/08-blindagem-de-seguranca.md`](../specs/08-blindagem-de-seguranca.md).
> **`F5-S10` foi acrescentado em 2026-09-09** (D-58) e roda **depois de `F5-S07`**: o número é
> identidade, não ordem.

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

> Cadastro, login por bearer e cookie, perfil, login social e e-mail transacional.

| Sprint | Arquivo                                                                   | Entrega                            |
| ------ | ------------------------------------------------------------------------- | ---------------------------------- |
| F3-S01 | [Better Auth](fase-3-identidade/F3-S01-better-auth.md)                    | R09–R12, `requireAuth`, decorators |
| F3-S02 | [Módulo `users`](fase-3-identidade/F3-S02-modulo-users.md)                | R13, R14, R15                      |
| F3-S03 | [OAuth social e e-mail](fase-3-identidade/F3-S03-oauth-social-e-email.md) | R26–R31, Resend, `v0.3.0`          |

### F4 — Biblioteca · `v0.4.0`

> O usuário monta playlists e favorita faixas.

| Sprint | Arquivo                                                            | Entrega       |
| ------ | ------------------------------------------------------------------ | ------------- |
| F4-S01 | [Módulo `playlists`](fase-4-biblioteca/F4-S01-modulo-playlists.md) | R16–R22       |
| F4-S02 | [Módulo `favorites`](fase-4-biblioteca/F4-S02-modulo-favorites.md) | R23, R24, R25 |
| F4-S03 | [Suíte E2E](fase-4-biblioteca/F4-S03-suite-e2e.md)                 | E1–E9         |

### F5 — Autenticação e blindagem · `v0.5.0`

> Contrato publicado e **os 27 GAPs da auditoria de segurança fechados**. Desde D-64 esta fase
> **não** contém deploy nem release: os dois foram para a F7.

| Sprint | Arquivo                                                                                  | Entrega                                       | GAPs                           |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| F5-S01 | [OpenAPI](fase-5-producao/F5-S01-openapi-e-docs.md)                                      | `openapi.json` + check no CI                  | —                              |
| F5-S02 | [Blindagem de borda](fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md)          | rate limit em produção, `trustProxy`, Swagger | 01, 04, 05, 06, 10, 17, 21, 27 |
| F5-S03 | [Recuperação de conta](fase-5-producao/F5-S03-recuperacao-de-conta-e-anti-enumeracao.md) | verificação obrigatória, anti-enumeração      | 07, 08, 14, 15, 22, 24, 25     |
| F5-S04 | [Sessão, schema e contrato](fase-5-producao/F5-S04-sessao-schema-e-contrato.md)          | `cookieCache`, índices, envelope RFC 7807     | 13, 16, 19, 20, 23, 26         |
| F5-S05 | [Two Factor](fase-5-producao/F5-S05-two-factor.md)                                       | R32–R40 · TOTP, OTP, backup codes             | 02, 09 (2FA)                   |
| F5-S06 | [Passkey](fase-5-producao/F5-S06-passkey-webauthn.md)                                    | R41–R45 · WebAuthn/FIDO2                      | 03, 09 (passkey)               |
| F5-S07 | [Rate limit distribuído](fase-5-producao/F5-S07-rate-limit-distribuido.md)               | `storage: 'database'`, chave final, origens   | 11, 12, 18                     |
| F5-S10 | [Vínculo de contas sociais](fase-5-producao/F5-S10-vinculo-de-contas-sociais.md)         | R46–R48 · política de linking (D-58)          | —                              |

Rastreabilidade completa GAP × sprint × seção normativa:
[`docs/specs/08-blindagem-de-seguranca.md`](../specs/08-blindagem-de-seguranca.md) §10.

---

### F6 — Áudio e imagem próprios na R2 · `v0.6.0`

> Tirar o catálogo de `soundhelix.com` e `images.unsplash.com` e pô-lo em
> `cdn.cardosolabs.space/cardoso-sound/`. **Caminho A (D-65): a API nunca fala com a R2** — segue
> read-only, devolvendo URL estática. D-09 e D-10 preservadas.

| Sprint | Arquivo      | Entrega                                                                    | GAPs |
| ------ | ------------ | -------------------------------------------------------------------------- | ---- |
| —      | _a escrever_ | Spec `09-midia-e-cdn.md`, `CDN_BASE_URL`, script de ingestão, seed migrado | —    |

Decisões fechadas: D-65 (Caminho A) · D-66 (acervo do dono) · D-67 (capas e avatares migram) ·
D-68 (convenção de nomes, bucket `cardosolabs-media`, CORS fora de escopo) · D-69
(`music-metadata`) · D-70 (`tsconfig.json` inclui `scripts/`). Insumo de planejamento:
`.claude/memory/handoff-f6-f7-audio-e-deploy.md`. **Há um pré-requisito manual do dono (P0)** —
comprar o domínio, criar o bucket e subir os 40 MP3 — antes que qualquer sprint da F6 execute.

---

### F7 — Deploy e release · `v1.0.0` · **última fase**

> A API no ar em `sound-api.cardosolabs.space`, com o catálogo próprio da F6, e o `v1.0.0` selado.

| Sprint | Arquivo                                                     | Entrega                                                             | GAPs          |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| F7-S01 | [Deploy na Railway](fase-7-deploy/F7-S01-deploy-railway.md) | Dockerfile, `railway.json`, `deploy.yml`, API no ar                 | —             |
| F7-S02 | _a escrever_                                                | Auditoria (spec `08` §9), README final, `docs/FLUTTER.md`, `v1.0.0` | portão dos 27 |

`F7-S01` é o antigo `F5-S08`, com o brief já auditado (D-61, D-62, D-63) e renumerado. Os ADRs que
ele registra são **D-71** (seed manual em produção) e **D-72** (sem rollback automático).

---

## Dependências entre sprints

```
F1-S01 ─▶ F1-S02 ─▶ F1-S03 ─▶ F1-S04 ─▶ F1-S05 ─▶ F1-S06 ─┐
                                                            │
F2-S01 ─▶ F2-S02 ─┬─▶ F2-S03 ─┐                            │
                  └─▶ F2-S04 ─┤◀───────────────────────────┘
                              │
                     F3-S01 ─▶ F3-S02 ─▶ F3-S03 ─┐
                                                 │
                          F4-S01 ─┬──────────────┘
                          F4-S02 ─┴─▶ F4-S03
                                        │
                          F5-S01 ─▶ F5-S02 ─▶ F5-S03 ─▶ F5-S04 ─┐
                                                                  │
                          ┌───────────────────────────────────────┘
                          └─▶ F5-S05 ─▶ F5-S06 ─▶ F5-S07 ─▶ F5-S10 ─┐
                              └── blindagem: 27 GAPs (D-49) ──┘      │
                                                                     │
                          F6 (a escrever, depende do P0 manual) ◀────┘
                                        │
                          F7-S01 ─▶ F7-S02 ─▶ v1.0.0
```

**A ordem é sequencial e não deve ser antecipada.** As únicas folgas: F2-S03 e F2-S04 são
independentes entre si (mas ambos dependem de F2-S02); F4-S01 e F4-S02 idem.

Dentro da blindagem a sequência é **rígida** e cada elo tem motivo:

| Elo             | Por que não pode inverter                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------- |
| S02 → S03       | S03 depende do rate limit funcionando: ela abre fluxos de e-mail que sem teto viram abuso      |
| S03 → S04       | S04 mexe na ponte e no schema; S03 já reescreveu o helper E2E de que os testes de S04 dependem |
| S04 → S05 → S06 | as tabelas de 2FA e Passkey entram **em cima** dos índices e restrições de S04                 |
| S06 → S07       | as 13 entradas de `customRules` só ficam completas depois que 2FA e Passkey existem            |
| S07 → S10       | S10 fecha a última superfície não documentada; depende do índice único de `account` (S04)      |
| S10 → F6        | **D-49 + D-64**: não se faz deploy com GAP aberto, e o deploy agora fica depois da F6          |
| F6 → F7-S01     | **D-65**: a API só sobe com o catálogo definitivo; migrar URL depois do deploy é retrabalho    |
| F7-S01 → F7-S02 | o checklist da spec `08` §9 exige evidência colhida **contra a API no ar**, não contra o local |

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
