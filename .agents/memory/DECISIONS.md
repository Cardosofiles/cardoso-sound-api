# DECISIONS — Registro de Decisões Técnicas

> Decisões **globais e duradouras** do projeto. Toda sessão de agente lê este arquivo
> na etapa de contextualização. **Uma decisão aqui vence qualquer suposição** e vence
> qualquer texto desatualizado em `README.md` ou `AGENTS.md`.
>
> **Não registre aqui:** detalhe de implementação de um sprint (vai no `F<n>-S<nn>.md`)
> nem coisa que já está escrita numa spec.
>
> Formato de entrada nova: próximo `D-nn` livre, status `vigente` | `revogada por D-xx`.

**Origem de D-01 a D-30:** entrevista de arquitetura de 2026-09-03 (7 rodadas, 28 decisões).
**D-31 em diante:** produzidas durante os sprints.

---

## Fundação e ambiente

### D-01 · Node 24 LTS, PostgreSQL 17, Zod 4

- **Data:** 2026-09-03 · **Sprint:** — · **Status:** vigente
- **Contexto:** `AGENTS.md` dizia Node 20 / PG 16 / Zod 3; `README.md` dizia Node 22 / PG 17;
  o `package.json` pina `zod@^4.4.3`; a máquina de desenvolvimento roda Node v24.20.0.
- **Decisão:** Node **24 LTS**, PostgreSQL **17**, **Zod 4**. Vale para `.nvmrc`, `engines`,
  Dockerfile, CI, `docker-compose.yml` e Testcontainers.
- **Consequência:** `AGENTS.md` e `README.md` são corrigidos em F1-S01. `@types/node` sobe
  para `^24`. Nenhum código Zod 3 (`z.string().email()` legado, `.passthrough()` etc.).

### D-02 · Controle do GitHub por `gh` CLI + MCP `github`

- **Data:** 2026-09-03 · **Status:** vigente
- **Contexto:** não havia `gh`, chave SSH nem token; a pasta não era repositório git.
- **Decisão:** `gh` CLI autenticado por browser (HTTPS + credential helper) como caminho
  principal; MCP `github` habilitado no Antigravity para PR e issues.
- **Consequência:** `gh run watch --exit-status` é **a** forma de comprovar CI verde.
  O `GITHUB_PERSONAL_ACCESS_TOKEN` em `.agents/mcp_config.json` permanece **placeholder**
  no repositório público — cada máquina preenche localmente.

### D-03 · E2E com `app.inject()`; Playwright sai do projeto

- **Data:** 2026-09-03 · **Status:** vigente
- **Contexto:** Playwright é citado em `README.md`, `.agents/rules/testing.md` e
  `.agents/skills/test-runner/`, mas **não é dependência** — `pnpm playwright test` falha.
- **Decisão:** E2E é Vitest + `app.inject()` do Fastify. Playwright não será instalado.
- **Consequência:** sem servidor, sem porta, sem browser, sem segundo runner no CI.
  Os três documentos acima são corrigidos em F1-S01, e `playwright` sai do `mcp_config.json`.

### D-04 · Higiene de dependências antes de codar

- **Data:** 2026-09-03 · **Sprint:** F1-S02 · **Status:** vigente
- **Decisão:** (a) `fastify` → `^5.8.5` e `better-auth` → `^1.7.2`; (b) remover
  `@neondatabase/serverless`, `ws`, `@types/ws`, `uuid`; (c) reconciliar `README.md` e
  `AGENTS.md` com D-01 e D-03.
- **Consequência:** Neon está fora — o Postgres é Docker local em dev e o addon da Railway
  em produção. UUID vem de `defaultRandom()` do Drizzle, não do pacote `uuid`.

---

## Git, CI e entrega

### D-05 · Repositório público `Cardosofiles/cardoso-sound-api`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** público, com rulesets em `main` e `develop` e check obrigatório `ci`.
- **Consequência:** Actions ilimitado e rulesets gratuitos. Em troca: **nenhum segredo em
  nenhum commit, nunca** — inclusive em commit posteriormente revertido.

### D-06 · O agente abre o PR e para; o merge é do dono

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** ao fim do sprint o agente empurra a branch, abre o PR, aguarda o CI ficar
  verde, atualiza a memória e **encerra a sessão** reportando o link.
- **Consequência:** o agente **nunca** executa `gh pr merge`, nunca faz merge local em
  `develop`, e **nunca inicia o sprint seguinte** por conta própria.

### D-07 · CI completa e bloqueante em todo PR

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** um job `ci`: install `--frozen-lockfile` → lint → typecheck → test
  (unit + integração com Testcontainers) → build.
- **Consequência:** um único caminho de verdade. Testcontainers roda no runner do GitHub
  (tem daemon Docker). Lockfile desatualizado quebra o build de propósito.

### D-08 · Tag e GitHub Release ao fim de cada fase

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `v0.1.0` (F1) · `v0.2.0` (F2) · `v0.3.0` (F3) · `v0.4.0` (F4) · `v1.0.0` (F5),
  via `release/vX.Y.0` → `main` → tag → back-merge em `develop`.
- **Consequência:** sem cerimônia de versão a cada sprint; o back-merge é obrigatório.

---

## Domínio

### D-09 · Catálogo read-only, sem RBAC

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** a API **não** escreve em `artists` nem `tracks`. Sem coluna `role`, sem
  guard de admin, sem painel administrativo.
- **Consequência:** mudar o catálogo = editar os `.data.ts` e rodar o seed idempotente.
  A menção a "RBAC" no `AGENTS.md` está fora de escopo e é removida em F1-S01.

### D-10 · `audioUrl` direto no payload; sem streaming e sem contadores

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `GET /tracks` devolve `audioUrl` e o `just_audio` toca direto do SoundHelix.
  Sem `/tracks/:id/stream`, sem `play_count`, sem `play_history`.
- **Consequência:** "rotas de streaming" e "contadores" no `README.md` são ficção e saem
  do texto. Nenhuma métrica de reprodução existe no MVP.

### D-11 · Busca `ILIKE` com índice GIN `pg_trgm`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `?search=` faz `ILIKE '%termo%'` em `tracks.title`, `tracks.album` e
  `artists.name`, com três índices GIN `gin_trgm_ops`.
- **Consequência:** a migração inicial precisa de **edição manual** — o Drizzle Kit não
  gera `CREATE EXTENSION` nem índice GIN com operator class. Ver spec `02` §5.

### D-12 · `genre` como coluna em `tracks`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `varchar(40)` NOT NULL, slug ASCII minúsculo, 6 valores:
  `rock`, `pop`, `electronic`, `hip-hop`, `jazz`, `lo-fi`. Sem tabela `genres`, sem
  tabela `albums` (`album` continua `varchar` livre).
- **Consequência:** habilita `?genre=` e `GET /api/v1/genres` sem join nem módulo novo.

---

## Contratos

### D-13 · Bearer **e** cookie aceitos simultaneamente

- **Data:** 2026-09-03 · **Status:** vigente
- **Contexto:** `README.md` prometia token em `flutter_secure_storage` (= bearer) e
  `rules/testing.md` mandava testar cookie. São mecanismos diferentes.
- **Decisão:** habilitar o plugin `bearer()` do Better Auth **sem** desligar o cookie httpOnly.
- **Consequência:** Flutter usa `Authorization: Bearer`; Swagger UI usa cookie. Ambos são
  testados (E2E E1 e E9). `set-auth-token` precisa entrar em `exposedHeaders` do CORS.

### D-14 · Paginação `page`/`limit` com envelope `meta`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `{ data, meta: { page, limit, total, totalPages, hasNext, hasPrev } }`.
  `limit` default 20, máximo 100.
- **Consequência:** todo repository de lista devolve `{ rows, total }`.
  `src/shared/utils/pagination.ts` centraliza o cálculo. Sem cursor.

### D-15 · Playlists privadas, ordenadas por `added_at`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** playlist tem nome, descrição e faixas. **Sem** coluna `position`, **sem**
  reordenação, **sem** `isPublic`, **sem** compartilhamento. Ordem = `added_at ASC`.
- **Consequência:** `playlist_tracks` é PK composta + `added_at`. Toda playlist pertence a
  um único usuário e é invisível para os demais.

### D-16 · `/api/v1/*` no domínio, `/api/auth/*` sem versão

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** rotas de domínio sob `/api/v1`; Better Auth no `basePath` padrão `/api/auth`;
  `/health` e `/health/ready` fora de qualquer prefixo.
- **Consequência:** a tabela de rotas do `README.md` (sem `v1`) está desatualizada e é
  corrigida. Um `/api/v2` futuro pode conviver com APKs já instalados.

---

## Infraestrutura

### D-17 · Deploy na Railway

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** Railway com builder Dockerfile, Postgres gerenciado no mesmo projeto,
  healthcheck em `/health/ready`, deploy disparado por push em `main`.
- **Consequência:** `railway.json` e `deploy.yml` são preenchidos em F5-S02.
  `RAILWAY_TOKEN` vive em GitHub Secrets. `drizzle/` precisa ir para a imagem final.

### D-18 · `pino-pretty` em desenvolvimento, JSON em test e produção

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** transport `pino-pretty` só com `NODE_ENV=development`; nível por `LOG_LEVEL`
  (`debug` em dev, `info` em prod, `silent` em test).
- **Consequência:** log legível localmente, parseável na Railway, silencioso na suíte.

### D-19 · CORS e rate limit permissivos fora de produção

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** fora de produção, `origin: true` e rate limit desligado (global e o do
  Better Auth). Em produção, `CORS_ORIGIN_LIST` fechada, 100 req/min por IP/usuário e
  10/min nas rotas de auth.
- **Consequência:** elimina 429 espúrio quebrando a suíte — a causa clássica de flake.
  App Flutter nativo não envia `Origin`, então CORS só protege browser.

### D-20 · `/health` (liveness) e `/health/ready` (readiness)

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `/health` não toca no banco; `/health/ready` faz `SELECT 1` no pool e
  responde 503 se falhar. Ambas fora do rate limit e do prefixo `/api/v1`.
- **Consequência:** `docker-compose`, Dockerfile e Railway apontam o healthcheck para
  `/health/ready`.

### D-21 · `openapi.json` versionado com verificação no CI

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `scripts/export-openapi.ts` gera `docs/openapi.json`, commitado.
  O CI regenera e falha se `git diff --exit-code` acusar diferença.
- **Consequência:** mudança de contrato de API aparece no diff do PR. `scripts/` passa a
  existir (hoje o script `openapi:export` aponta para o vazio).

### D-22 · Redaction de headers sensíveis no Pino — baseline, não feature

- **Data:** 2026-09-03 · **Status:** vigente · **Origem:** recomendação do arquiteto
- **Contexto:** repositório público + API pública. Um `request.log.error` num erro de auth
  despejaria `Authorization: Bearer <token>` e `Set-Cookie` no stdout da Railway.
- **Decisão:** `redact` obrigatório em `authorization`, `cookie`, `set-cookie`,
  `set-auth-token`, `*.password`, `*.token`.
- **Consequência:** entra em F1-S05 junto com a configuração do logger. Custo ~4 linhas.

---

## Processo

### D-23 · Um sprint = um PR = um módulo ou camada completa

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** 18 sprints em 5 fases. Cada sprint cabe em uma sessão de agente e produz
  um PR revisável.
- **Consequência:** sprint que não couber em uma sessão deve ser dividido — o agente
  para e reporta em vez de entregar metade.

### D-24 · Memória em `.agents/memory/`

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `PROGRESS.md` (estado), `DECISIONS.md` (este arquivo), `F<n>-S<nn>.md`
  (resumo por sprint, ex.: `F1-S01.md`, `F2-S04.md`), `_TEMPLATE.md` (molde).
- **Consequência:** resolve a ambiguidade do enunciado (`DECISION.md` vs `DECISOES.md`).
  Nomes em inglês, coerentes com `rules/` e `skills/`. Os `F<n>-S<nn>.md` **não** são
  carregados automaticamente.

### D-25 · Documentação em PT-BR

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** `docs/specs/**` e `docs/sprints/**` em português. `.agents/rules/**` e
  `.agents/skills/**` permanecem em inglês. `.agents/memory/**` em português, com nomes
  de arquivo em inglês.
- **Consequência:** ao editar um arquivo, **use o idioma do arquivo**.

---

## Qualidade e escopo final

### D-26 · `under-pressure` implementado com `healthCheck` no pool

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** limites de event loop, heap e RSS + `healthCheck` fazendo `SELECT 1`.
  `exposeStatusRoute: false` — `/health/ready` já é a rota pública e usa a mesma checagem.
- **Consequência:** `src/plugins/under-pressure.plugin.ts` deixa de ser arquivo morto.

### D-27 · Sem meta percentual de cobertura

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** o que trava o merge é a lista **nominal** de casos obrigatórios de cada
  sprint (happy path, 400, 401, 404, 409, paginação, limite).
- **Consequência:** nada de `vitest --coverage` bloqueante. Evita teste de encher linguiça.
  A revisão do PR confere a tabela de casos do sprint, uma a uma.

### D-28 · Seed com 8 artistas, 40 faixas e 6 gêneros

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** 5 faixas por artista; todo gênero com ≥ 5 faixas; idempotente via
  `onConflictDoNothing` com alvo em `artists.name` e `(tracks.artist_id, tracks.title)`.
- **Consequência:** o SoundHelix só publica ~16 URLs distintas — o **áudio repete** e isso
  é aceito. Os metadados é que devem ser únicos e plausíveis. 40 faixas dão 2 páginas
  cheias com `limit=20`, exercitando a paginação de verdade.

### D-29 · Catálogo público antes de autenticação

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** ordem das fases — F1 Fundação → F2 Catálogo → F3 Identidade →
  F4 Biblioteca → F5 Produção.
- **Consequência:** o app Flutter lista e toca música **antes da metade do projeto**,
  sem depender de auth. Auth entra sobre uma base já provada por testes.

### D-30 · Anatomia obrigatória do arquivo de sprint

- **Data:** 2026-09-03 · **Status:** vigente
- **Decisão:** todo `F<n>-S<nn>-*.md` contém, nesta ordem: prompt literal de abertura ·
  objetivo e contexto · specs obrigatórias · contratos esperados · **blast radius fechado** ·
  passo a passo · casos de teste obrigatórios · DoD com comandos · protocolo de CI vermelho ·
  o que registrar na memória · armadilhas conhecidas.
- **Consequência:** um sprint sem blast radius não é executável — o agente para e pede.

### D-32 · Política de scripts de build das dependências

- **Data:** 2026-09-03 · **Sprint:** — (pré-F1-S01) · **Status:** vigente
- **Contexto:** o pnpm 11 aborta o `install` com `ERR_PNPM_IGNORED_BUILDS` enquanto houver
  pacote com script de build sem decisão. O `pnpm-workspace.yaml` do scaffold trazia
  `allowBuilds` com valores placeholder (`set this to true or false`), que são strings —
  não booleanos — e por isso não contavam como decisão.
- **Decisão:** `esbuild: true` e `unrs-resolver: true`; `ssh2`, `cpu-features` e
  `protobufjs` em `false`.
- **Consequência:** `esbuild` (5 versões, vindas de tsup, vite/vitest e drizzle-kit)
  precisa do postinstall para baixar o binário da plataforma. `unrs-resolver` é o binding
  nativo do `eslint-import-resolver-typescript`, do qual o `eslint-plugin-boundaries`
  depende — **sem ele as fronteiras de arquitetura não são verificadas**. Os outros três
  vêm de `@testcontainers/postgresql` → `dockerode`, e só seriam exercitados falando com
  um Docker remoto por SSH; localmente é socket unix. `pnpm approve-builds --all`
  aprovaria os cinco — **não use**, a escolha é deliberada.
- **Nota:** `ws` saiu do `package.json` neste install. **A poda de D-04 continua pendente**
  para `@neondatabase/serverless`, `uuid` e `@types/ws` — é trabalho de F1-S02.

### D-33 · Autenticação do GitHub por SSH

- **Data:** 2026-09-03 · **Sprint:** — (pré-F1-S01) · **Status:** vigente
- **Contexto:** D-02 previa `gh auth login` por HTTPS + credential helper. O login foi
  feito escolhendo **SSH**, com geração de chave nova.
- **Decisão:** o protocolo git é **SSH**. Chave `~/.ssh/id_ed25519.pub` (com passphrase)
  enviada à conta `Cardosofiles`. `gh` 2.46.0 do repositório do Ubuntu.
- **Consequência:** `git push` usa a chave, não o token OAuth — o que evita a restrição de
  escopo `workflow` do GitHub em arquivos de `.github/workflows/`. Se algum push de
  workflow for recusado mesmo assim, rode `gh auth refresh -h github.com -s workflow`.
  Verificado nesta versão do `gh`: `gh run watch --exit-status` **existe** (D-07 e o
  protocolo de CI vermelho seguem válidos) e `gh ruleset` é **somente leitura** — criar
  ruleset é por `gh api` ou pela web.

### D-31 · Recurso de outro usuário responde 404, não 403

- **Data:** 2026-09-03 · **Status:** vigente · **Origem:** derivada de D-15 pelo arquiteto
- **Contexto:** playlists são privadas e identificadas por UUID. Responder 403 confirmaria
  a existência do recurso a quem não pode vê-lo (enumeração).
- **Decisão:** playlist inexistente e playlist de outro usuário são **indistinguíveis**:
  ambas `404 Not Found`. O isolamento é feito na cláusula `WHERE` da query, nunca em memória.
- **Consequência:** **nenhuma rota do MVP emite 403.** `ForbiddenError` existe na hierarquia
  de erros para uso futuro. O caso E6 da suíte E2E cobre exatamente isso.
