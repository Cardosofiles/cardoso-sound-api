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

### D-34 · `exactOptionalPropertyTypes: false` no TypeScript

- **Data:** 2026-09-03 · **Sprint:** F1-S02 · **Status:** vigente
- **Contexto:** com `exactOptionalPropertyTypes: true`, propriedades opcionais tipadas como `prop?: string` rejeitam explicitamente `{ prop: undefined }`, gerando atrito e incompatibilidade severa com `fastify-type-provider-zod` e schemas de validação Fastify.
- **Decisão:** manter `exactOptionalPropertyTypes: false` no `tsconfig.json`.
- **Consequência:** schemas e plugins Fastify convivem com campos opcionais sem type assertions redundantes.

### D-35 · `bundle: false` no tsup

- **Data:** 2026-09-03 · **Sprint:** F1-S02 · **Status:** vigente
- **Contexto:** os scripts de produção (`db:migrate:deploy` apontando para `dist/db/migrate.js` e `jobs` apontando para `dist/jobs/runner.js`) exigem preservar a estrutura modular de arquivos em `dist/`. Um bundle unificado mesclaria entradas e romperia resolução relativa de imports ESM com terminação `.js`.
- **Decisão:** `bundle: false` na configuração de empacotamento do `tsup.config.ts`.
- **Consequência:** a árvore de módulos compilados espelha `src/` em `dist/` com integridade de caminhos e sourcemaps.

### D-36 · `singleFork: true` no pool do Vitest

- **Data:** 2026-09-03 · **Sprint:** F1-S02 · **Status:** vigente
- **Contexto:** em suítes com Testcontainers (PostgreSQL efêmero a partir de F2-S02), a execução paralela indiscriminada de múltiplos processos concorre por portas/sockets e pode disparar containers demais no daemon Docker local ou nos runners de CI.
- **Decisão:** configurar `pool: 'forks'` com `poolOptions: { forks: { singleFork: true } }` em `vitest.config.ts`.
- **Consequência:** execução previsível e sequencial de suítes que necessitam de isolamento de infraestrutura real, prevenindo contenção de recursos.

### D-37 · `src/db/client.ts` e barrel vazio antecipados para F1-S06

- **Data:** 2026-09-04 · **Sprint:** F1-S06 · **Status:** vigente
- **Contexto:** `/health/ready` e o `healthCheck` do `@fastify/under-pressure` necessitam de um `pg.Pool` real para executar `SELECT 1`. O planejamento original previa `src/db/` apenas em F2-S01.
- **Decisão:** antecipar a criação de `src/db/client.ts` (com `pg.Pool`, instância `db` do Drizzle ORM, `checkDatabase` e `setPool`) e criar `src/db/schema/index.ts` como barrel vazio (`export {};`). A modelagem relacional de tabelas permanece em F2-S01.
- **Consequência:** o pool de conexão é tratado como infraestrutura fundamental da fundação (F1) e schemas de banco como domínio (F2). O Drizzle é instanciado desde F1 sem quebrar tipagem ou execução.

### D-38 · 503 global do `under-pressure` e bypass para sondas de `/health*`

- **Data:** 2026-09-04 · **Sprint:** F1-S06 · **Status:** vigente
- **Contexto:** quando a conectividade com o banco de dados falha, o plugin `@fastify/under-pressure` entra em estado degradado e responde 503 Service Unavailable em todas as rotas da API. Contudo, sondas de liveness (`/health`) de orquestradores (Railway, Kubernetes) não devem falhar para evitar reinicializações desnecessárias do processo Node, e `/health/ready` deve emitir seu próprio contrato de indisponibilidade (`{ status: 'unavailable', database: 'down' }`).
- **Decisão:** configurar `pressureHandler: () => {}` no route config de `/health` e `/health/ready`.
- **Consequência:** se o Postgres estiver inoperante, rotas de aplicação são protegidas com 503 global pelo `under-pressure`, enquanto `/health` continua respondendo 200 (processo vivo) e `/health/ready` devolve 503 com payload específico sem envelope de erro RFC 7807.

### D-39 · Edição manual permanente de migração para `pg_trgm` e índices GIN

- **Data:** 2026-09-04 · **Sprint:** F2-S01 · **Status:** vigente
- **Contexto:** o Drizzle Kit não gera comandos de extensões do PostgreSQL (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) nem índices GIN com classes de operador customizadas (`gin_trgm_ops`) a partir de definições TypeScript.
- **Decisão:** a migração inicial `drizzle/0000_*.sql` recebe edição manual mandatória contendo `CREATE EXTENSION IF NOT EXISTS pg_trgm;` no topo e os três `CREATE INDEX ... USING GIN (... gin_trgm_ops)` ao final.
- **Consequência:** o arquivo SQL gerado passa a ser a fonte de verdade imutável para a extensão e índices GIN. Novas migrações via `pnpm db:generate` respeitam o estado sincronizado sem sobrescrever essas instruções.

### D-40 · Schemas Better Auth v1.7.2 especificados com Drizzle ORM

- **Data:** 2026-09-04 · **Sprint:** F2-S01 · **Status:** vigente
- **Contexto:** `better-auth` v1.7.2 utiliza como chave primária identificadores em formato textual (`text('id')`) e chaves estrangeiras com deleção em cascata (`onDelete: 'cascade'`).
- **Decisão:** os modelos de autenticação (`user`, `session`, `account`, `verification`) são declarados estritamente em `src/db/schema/users.schema.ts` com tipos `text` e constraints canônicas alinhadas à spec 02 §3 e à versão 1.7.2 instalada.
- **Consequência:** relações de domínio que apontam para o usuário (`playlists.user_id`, `favorites.user_id`) devem impreterivelmente utilizar o tipo `text('user_id')`, prevenindo erros de incompatibilidade de tipos de foreign key no PostgreSQL.

### D-41 · Projeção estruturada com innerJoin e select explícito para queries com filtros relacionais

- **Data:** 2026-09-04 · **Sprint:** F2-S04 · **Status:** vigente
- **Contexto:** Consultas com busca textual em múltiplas tabelas (ex: `tracks.title`, `tracks.album` e `artists.name`) exigem junções relacionais. Usar `db.query.*` não permite busca por `artists.name` na raiz de forma performática, enquanto `db.select().from(tracks).innerJoin(artists, ...)` sem mapeamento devolve tuplas brutas achatadas.
- **Decisão:** Utilizar `db.select({ ...campos, artist: { id: artists.id, name: artists.name, avatarUrl: artists.avatarUrl } }).from(tracks).innerJoin(artists, eq(tracks.artistId, artists.id))`. O Drizzle ORM preserva a hierarquia e monta o objeto aninhado nativamente, sem necessidade de pós-processamento, e a mesma cláusula `where` e `innerJoin` são reutilizados na query de contagem `count()`.
- **Consequência:** Padrão consolidado para `tracks` e a ser replicado em `playlists` (F4-S01) e `favorites` (F4-S02).

### D-42 · Claude Code (Opus 5) é o Staff Engineer; Antigravity executa

- **Data:** 2026-09-05 · **Status:** vigente
- **Contexto:** o desenho arquitetural não tinha dono declarado. `AGENTS.md`, `.agents/README.md`
  e `.agents/agents/backend-architect.md` atribuíam ao agente de execução o desenho de DTOs,
  contratos de rota e estrutura Fastify — as mesmas responsabilidades que o `CLAUDE.md` passou a
  atribuir ao Claude Code. Dois donos para a mesma decisão produzem contratos divergentes entre
  sprints.
- **Decisão:** **Claude Code (Opus 5) é o Staff Engineer permanente** e detém a direção técnica:
  `docs/specs/**`, os sprint briefs em `docs/sprints/**`, este arquivo, `.agents/rules/**` e os
  revisores em `.claude/agents/**`. Os **agentes Antigravity executam**: planejam a
  implementação, codificam, validam, entregam o PR e registram — produzindo `src/**`,
  `tests/**`, `docs/agents-plans/**`, `PROGRESS.md` e `F<n>-S<nn>.md`.
  `backend-architect` é rebaixado a **conferência de conformidade**: verifica a implementação
  contra os contratos já decididos e **não projeta**.
- **Consequência:** **o protocolo de sete etapas da spec `07` não muda.** As Etapas 2 (Planejar)
  e 3 (Autorizar ⏸) continuam sendo do agente de execução e do dono, respectivamente — o plano
  segue nascendo no Antigravity e sendo persistido em `docs/agents-plans/`. Muda apenas a origem
  do sprint brief. Buraco de contrato em um brief é defeito do Staff e se corrige com ADR ou
  emenda à spec, nunca com palpite durante a implementação.

### D-43 · Adição da coluna issuer na tabela account do Better Auth v1.7.2

- **Data:** 2026-09-05 · **Sprint:** F3-S01 · **Status:** vigente
- **Contexto:** o Better Auth v1.7.2 exige obrigatoriamente a coluna `issuer` na tabela `account` (alimentada internamente com `"credential"` via `createLocalAccountIssuer("credential")` no cadastro de e-mail e senha). O `@better-auth/drizzle-adapter` valida a existência de todas as propriedades no schema Drizzle; a ausência de `issuer` gerava exceção em runtime interrompendo o sign-up.
- **Decisão:** adicionar `issuer: text('issuer').notNull().default('credential')` na tabela `account` em `src/db/schema/users.schema.ts` e gerar a migração `drizzle/0001_early_blazing_skull.sql` com `ALTER TABLE "account" ADD COLUMN "issuer" text DEFAULT 'credential' NOT NULL;`.
- **Consequência:** schema perfeitamente sincronizado com o Better Auth v1.7.2. Aplicação automática garantida em produção e no harness do Testcontainers.

### D-44 · Repasse de múltiplos cabeçalhos Set-Cookie via getSetCookie() na ponte Fastify↔Fetch

- **Data:** 2026-09-05 · **Sprint:** F3-S01 · **Status:** vigente
- **Contexto:** o Fastify e o Better Auth operam sobre contratos HTTP distintos (Node.js IncomingMessage vs Fetch API Request/Response). Ao converter a resposta de `auth.handler(req)`, o método tradicional `res.headers.forEach()` pode colapsar múltiplos cabeçalhos `Set-Cookie` em uma única string concatenada com vírgulas, corrompendo a leitura de cookies e sessions em browsers e Swagger UI.
- **Decisão:** utilizar `res.headers.getSetCookie()` no handler de `auth.plugin.ts` e despachar explicitamente o array para o Fastify via `reply.header('set-cookie', setCookies)`. Os demais headers são repassados iterativamente excluindo `set-cookie`.
- **Consequência:** múltiplos cookies emitidos pelo Better Auth (ex: session token e CSRF/state) são repassados de forma íntegra e atômica para o cliente HTTP.

### D-45 · Centralização da rota coringa /api/auth/* no auth.plugin.ts por regras de boundary

- **Data:** 2026-09-05 · **Sprint:** F3-S01 · **Status:** vigente
- **Contexto:** o sprint §5.5 apresentava duas opções para `src/modules/auth/auth.routes.ts`: (a) reexport documentado com `export {}` ou (b) mover a rota coringa para `auth.routes.ts`. Contudo, as regras de arquitetura em `eslint.config.mjs` classificam `auth.plugin.ts` como `plugin` e `auth.routes.ts` como `routes`. A regra de boundaries proíbe estritamente que elementos `plugin` importem elementos `routes` (`from: 'plugin' allow: ['shared', 'config', 'dto', 'db']`).
- **Decisão:** adotar a Opção (a): a rota coringa `['GET', 'POST', 'OPTIONS'] /api/auth/*` e a ponte Fetch API vivem integralmente no `auth.plugin.ts`. O arquivo `auth.routes.ts` permanece como documentação estrutural canônica com `export {};`.
- **Consequência:** isolamento estrito de boundaries sem necessidade de violar regras do ESLint ou estender permissões desnecessariamente.

### D-46 · Verificação de e-mail não-bloqueante, provedores OAuth confiáveis, rate limit e sessões pós-reset

- **Data:** 2026-09-05 · **Sprint:** F3-S03 · **Status:** vigente
- **Contexto:** a conclusão da Fase 3 entrega autenticação social (Google, GitHub, Facebook), verificação de e-mail transacional e recuperação de senha. Várias definições de segurança e arquitetura foram consolidadas:
  (a) `requireEmailVerification: false` — revogada por D-51: habilitar bloqueio prévio exigiria fluxo obrigatório de confirmação por clique antes de qualquer sign-in, quebrando o helper `signUpAndGetToken` do qual dependem os testes E2E e as suítes das Fases 3, 4 e 5. A verificação ocorre via token enviado por e-mail, mas o sign-in não é bloqueado preventivamente;
  (b) Provedores sociais e `accountLinking`: Google e GitHub realizam verificação mandante de e-mail (com escopo obrigatório `user:email` no GitHub), sendo classificados como `trustedProviders`. O Facebook foi deliberadamente excluído de `trustedProviders` para mitigar ataques de sequestro de conta em virtude de dependência de App Review da Meta e inconsistência de garantia de verificação de e-mail;
  (c) Proteção de Rate Limit (`customRules`): limites rigorosos foram configurados em `auth.config.ts`: `/forget-password` (3/h), `/send-verification-email` (3/h), `/reset-password` (5/h), `/sign-in/social` (10/min), mantendo a ativação condicionada a produção (`isProduction`), conforme D-19;
  (d) Versões exatas validadas: `better-auth@1.7.2` e `resend@6.26.0`;
  (e) Comportamento de sessões ativas pós-reset de senha — revogada por D-52: no Better Auth v1.7.2 padrão (sem `revokeSessionsOnPasswordReset: true`), sessões ativas prévias persistem na base de dados PostgreSQL e continuam válidas após a redefinição de senha (comportamento inspecionado e verificado no caso T20).
- **Decisão:** registrar as diretrizes acima como política canônica de autenticação social e e-mail transacional do projeto.
- **Consequência:** conformidade integral com os requisitos R26–R31, preservação dos testes determinísticos em ambiente local/CI e proteção estrita contra open redirect (`trustedOrigins` e `disableOriginCheck: false`).

### D-47 · Autocontenção de repositórios e mitigação de concorrência em associações de biblioteca

- **Data:** 2026-09-06 · **Sprint:** F4-S01 · **Status:** vigente
- **Contexto:**
  1. A inclusão de faixas em playlists (`POST /api/v1/playlists/:id/tracks`) exige a verificação de existência da faixa no catálogo (`tracks`). Duas opções foram consideradas no sprint §5.3: (a) consulta direta `trackExists` dentro de `PlaylistsRepository` ou (b) injetar `TracksRepository` no `PlaylistsService`.
  2. Em tabelas associativas com chave primária composta (`playlist_tracks`), inserções concorrentes simultâneas de uma mesma faixa podem ultrapassar a checagem prévia (`hasTrack`) e gerar colisão de PK com erro `23505` (unique_violation) no PostgreSQL, que resultaria em HTTP 500 caso não tratado.
- **Decisão:**
  1. Adotar a Opção (a): `PlaylistsRepository.trackExists(trackId)` com query direta (`SELECT id FROM tracks WHERE id = $1 LIMIT 1`). Repositórios não importam outros repositórios (Spec 01 §1 e regras de boundary em `eslint.config.mjs`). A duplicação controlada de um `select` simples de existência preserva o desacoplamento e a autocontenção modular.
  2. Aplicar verificação explícita prévia (`hasTrack`) para garantia determinística de HTTP 409 Conflict combinada com `.onConflictDoNothing().returning()` na inserção: caso o retorno seja vazio decorrente de uma corrida concorrente entre requisições simultâneas, o serviço intercepta o resultado e responde HTTP 409 Conflict.
- **Consequência:** o módulo `playlists` opera de forma completamente autocontida, com isolamento estrito de boundaries, sem acoplamento entre repositórios e com proteção determinística contra colisões concorrentes. Este mesmo padrão será replicado no módulo `favorites` (F4-S02).

### D-48 · Container Singleton no Harness E2E para Suíte de Fluxos Completos

- **Data:** 2026-09-08 · **Sprint:** F4-S03 · **Status:** vigente
- **Contexto:**
  1. `src/db/client.ts` inicializa o pool no import lendo `env.DATABASE_URL`. A suíte E2E necessita que a aplicação Fastify aponte para o PostgreSQL efêmero do Testcontainers sem alterar código de produção (`src/`).
  2. Subir um container Testcontainers por arquivo de spec multiplicaria o tempo por 5 (~25-30s adicionais de setup Docker), correndo o risco de estourar a meta estrita de < 45s da Spec 05 §1.
  3. Configurar `globalSetup` no Vitest exigiria modificar `vitest.workspace.ts` e adicionar arquivo de setup global, estendendo o blast radius fechado do sprint.
- **Decisão:**
  Implementar a estratégia de Container Singleton em `tests/e2e/helpers/app.ts`. Respaldado pela decisão D-36 (`singleFork: true` para o project `e2e` no Vitest), o container PostgreSQL 17 sobe uma única vez para toda a suíte E2E no primeiro teste que invocar `buildTestApp()`. O pool de conexões é sincronizado transparentemente via `setPool(sharedTestDb.pool)` e `process.env.DATABASE_URL = sharedTestDb.connectionString`. O isolamento estrito entre testes é garantido compulsoriamente por `truncateAll(db)` seguido de `seed(db)` no `beforeEach` de cada spec.
- **Consequência:**
  A suíte E2E executa os 5 arquivos de fluxo em ~20-28s (metade do teto de 45s), preserva o blast radius estritamente fechado, garante determinismo total inclusive sob `--sequence.shuffle` e dispensa qualquer refatoração em `src/db/client.ts`.

### D-49 · Blindagem de segurança precede o deploy: Fase 5 renumerada para 9 sprints

- **Data:** 2026-09-09 · **Sprint:** — (decisão do Staff) · **Status:** vigente
- **Contexto:** a auditoria de `docs/issue/AUTHENTICATION.md` levantou 27 GAPs, um deles crítico
  (`rate-limit.plugin.ts:8` desliga o rate limit global exatamente em produção) e outro que torna o
  rate limit de autenticação inoperante em qualquer topologia (`X-Forwarded-For` sem
  `trustedProxies`). O roadmap original punha `F5-S02 · Deploy na Railway` antes de qualquer
  correção — ou seja, colocaria no ar uma aplicação com negação de serviço e bypass de rate limit
  conhecidos e documentados.
- **Opções consideradas:** (a) manter a numeração e executar as sprints de segurança fora de ordem;
  (b) criar uma fase F6 depois da `v1.0.0`; (c) renumerar a Fase 5 inserindo a blindagem entre o
  OpenAPI e o deploy.
- **Decisão:** opção (c). A Fase 5 passa a ter **9 sprints**: `F5-S01` (OpenAPI, inalterado),
  `F5-S02`…`F5-S07` (blindagem, novos), `F5-S08` (deploy, era `F5-S02`) e `F5-S09` (hardening e
  release `v1.0.0`, era `F5-S03`). O número do sprint volta a ser igual à ordem de execução, que é
  o que `PROGRESS.md` promete a quem abre a sessão.
- **Consequência:** `docs/sprints/fase-5-producao/F5-S02-deploy-railway.md` e
  `F5-S03-hardening-e-release.md` são renomeados para `F5-S08-*` e `F5-S09-*`, com os campos
  **Depende de**, o nome da branch e o caminho no prompt de abertura atualizados. O projeto passa
  de 19 para **25 sprints**. Nenhuma `v1.0.0` sai com GAP aberto: a §7 da spec `04` e o checklist
  ampliado da spec `08` §9 são o portão de F5-S09.

### D-50 · Confiança em proxy declarada por contagem de hops e CIDR, nunca por `true`

- **Data:** 2026-09-09 · **Sprint:** F5-S02 · **Status:** vigente
- **Contexto:** o Fastify não tem `trustProxy` (GAP-10), então `req.ip` devolve o IP do balanceador
  da Railway para todos os clientes; e o Better Auth resolve a chave de rate limit a partir de
  `X-Forwarded-For` sem `advanced.ipAddress.trustedProxies` (GAP-04), o que permite forjar o IP e
  contornar todos os limites de autenticação. `trustProxy: true` trocaria um problema por outro:
  o Fastify passaria a confiar na cadeia inteira, e o cliente voltaria a poder forjar o IP.
- **Decisão:** a confiança em proxy é **declarada, nunca inferida**. Duas variáveis novas em
  `src/config/env.ts`: `TRUST_PROXY_HOPS` (inteiro ≥ 0, default `0` = desligado) alimenta
  `Fastify({ trustProxy })`, e `TRUSTED_PROXIES` (CSV de CIDRs, default vazio) alimenta
  `advanced.ipAddress.trustedProxies` do Better Auth. Em `production`, ambas são **obrigatórias e
  não vazias** — o boot falha com `process.exit(1)` se faltarem.
- **Consequência:** falha fechada e ruidosa. Um deploy sem a topologia declarada não sobe, em vez
  de subir com rate limit desarmado. Fora de produção o default `0` / vazio preserva o
  comportamento atual e não afeta a suíte. F5-S08 é responsável por preencher os valores reais da
  Railway nas Railway Variables.

### D-51 · Verificação de e-mail passa a ser obrigatória — D-46 (a) revogada

- **Data:** 2026-09-09 · **Sprint:** F5-S03 · **Status:** vigente · **revoga D-46 (a)**
- **Contexto:** D-46 (a) fixou `requireEmailVerification: false` com uma justificativa de
  conveniência de teste: `true` quebraria o helper `signUpAndGetToken`. A auditoria mostrou o preço
  disso em dois GAPs distintos: (i) GAP-14 — qualquer pessoa se cadastra com o e-mail de um
  terceiro, recebe sessão de 7 dias e, pelo `user_email_unique`, **impede o dono real de se
  cadastrar**; (ii) GAP-08 — o Better Auth só emite a resposta genérica de duplicidade quando
  `requireEmailVerification` **ou** `autoSignIn: false` está ativo
  (`dist/api/routes/sign-up.mjs:163`), então hoje `POST /sign-up/email` é um oráculo de enumeração
  de contas: 422 significa cadastrado, 200 significa novo.
- **Opções consideradas:** (a) `autoSignIn: false` — resolve só a enumeração e muda o contrato de
  R09, que hoje devolve bearer no cadastro; (b) `requireEmailVerification: true` — resolve os dois
  GAPs e preserva R09; (c) manter e aceitar o risco.
- **Decisão:** opção (b). `requireEmailVerification: true`. A justificativa de D-46 (a) não se
  sustenta: o transporte de memória expõe o link em `outbox`, então o helper passa a fazer
  `sign-up` → ler o `outbox` → `GET /verify-email` → `sign-in`, de forma determinística e sem rede.
  É trabalho mecânico num helper, contra dois vetores de abuso permanentes em produção.
- **Consequência:** `tests/e2e/helpers/auth.ts` e todo teste que cadastra usuário são reescritos em
  F5-S03; os casos T6 e T8 de F3 mudam de expectativa e são reescritos no mesmo PR. A spec `04`
  §1.2 é substituída pela spec `08` §4. `POST /sign-in/email` passa a responder 403 enquanto o
  e-mail não for verificado — isso é contrato novo e vai para a spec `03` §5 em F5-S09.

### D-52 · Reset de senha revoga todas as sessões — D-46 (e) revogada

- **Data:** 2026-09-09 · **Sprint:** F5-S03 · **Status:** vigente · **revoga D-46 (e)**
- **Contexto:** D-46 (e) apenas **registrou** que, sem `revokeSessionsOnPasswordReset: true`, as
  sessões anteriores sobrevivem ao reset — comportamento verificado no caso T20, que hoje o
  **afirma como esperado**. Na prática isso significa que o fluxo de recuperação de conta não
  recupera a conta: um atacante com cookie ou bearer roubado mantém acesso total por até 7 dias
  depois de a vítima trocar a senha, inclusive ao `DELETE /api/v1/me`.
- **Decisão:** `emailAndPassword.revokeSessionsOnPasswordReset: true`. Registrar um comportamento
  não é aceitá-lo; D-46 (e) descrevia o default da lib, não uma escolha do projeto.
- **Consequência:** T20 é reescrito em F5-S03 com a expectativa invertida — o bearer anterior ao
  reset passa a responder 401. A chave de configuração é `revokeSessionsOnPasswordReset`;
  `revokeOtherSessions` é parâmetro do corpo de `POST /change-password` e **não** existe como opção
  de `emailAndPassword` — escrevê-la ali é no-op silencioso.

### D-53 · Two Factor obrigatório na oferta: TOTP, OTP por e-mail e backup codes

- **Data:** 2026-09-09 · **Sprint:** F5-S05 · **Status:** vigente
- **Contexto:** GAP-02. O plugin `twoFactor` vive em `better-auth/plugins`, pacote já instalado —
  não há dependência nova. Além dos nove endpoints, o plugin traz o **bloqueio de conta nativo**
  (contador compartilhado entre TOTP, OTP e backup codes que devolve
  `429 ACCOUNT_TEMPORARILY_LOCKED`), que é hoje a única defesa por conta que o projeto não tem —
  o rate limit é por IP e, antes de F5-S02, contornável.
- **Decisão:** habilitar `twoFactor({ issuer: 'Cardoso Sound', skipVerificationOnEnable: false,
totpOptions: { digits: 6, period: 30, backupCodes: { count: 10 } }, otpOptions: { digits: 6,
period: 10, sendOTP } })`. O 2FA é **opcional por usuário** (`user.twoFactorEnabled`), nunca
  imposto no cadastro. `trustDevice` fica **desligado** no MVP: 30 dias de isenção por dispositivo
  é superfície que não temos como revogar sem uma tela de gestão de dispositivos.
- **Consequência:** schema ganha `user.two_factor_enabled` e a tabela `two_factor`; o template
  `twoFactorOtpEmail` entra em `src/shared/email/templates.ts`; `POST /sign-in/email` passa a
  poder devolver `{ twoFactorRedirect: true }` em vez de sessão, o que é contrato novo para o
  cliente Flutter.

### D-54 · Passkey com `@better-auth/passkey`; `rpID` derivado de `BETTER_AUTH_URL`

- **Data:** 2026-09-09 · **Sprint:** F5-S06 · **Status:** vigente
- **Contexto:** GAP-03. Diferente do 2FA, o Passkey exige **dependência nova de produção**
  (`@better-auth/passkey`), o que por política precisa de ADR antes do sprint.
- **Decisão:** aprovar `@better-auth/passkey`. `rpID`, `rpName` e `origin` são **derivados de
  `BETTER_AUTH_URL`**, nunca variáveis próprias: `rpID = new URL(env.BETTER_AUTH_URL).hostname` e
  `origin = env.BETTER_AUTH_URL` sem barra final. `registration.requireSession: true` — o MVP não
  tem fluxo passkey-first, e `false` exigiria um `resolveUser` que identifica usuário sem sessão,
  superfície que não precisamos abrir.
- **Consequência:** duas fontes de verdade para o domínio (`BETTER_AUTH_URL` e `rpID`) tornam-se
  uma só, o que elimina a classe de bug em que o passkey registrado em `localhost` não valida em
  produção. A tabela `passkey` exige `UNIQUE(credential_id)` — sem ela o mesmo credential WebAuthn
  pode ser registrado sob dois usuários e a resolução de identidade no `sign-in` fica ambígua — e a
  coluna `aaguid`, consumida por `registration.afterVerification`.

### D-55 · Rate limit: `storage: 'database'` no Better Auth, Redis opcional por env no Fastify, chave por IP

- **Data:** 2026-09-09 · **Sprint:** F5-S07 · **Status:** vigente
- **Contexto:** três problemas relacionados. GAP-12: os dois limitadores contam em memória, então
  com `k` réplicas o limite efetivo é `k × max`. GAP-11: o `keyGenerator` lê `req.user?.id` num
  hook que roda **antes** do hook que popula `request.user`, então o ramo é código morto e o cast
  `as unknown as` esconde isso do type checker. A correção óbvia — registrar o rate limit depois do
  auth — é errada duas vezes: tiraria do teto a própria rota coringa `/api/auth/*`, registrada
  dentro do `authPlugin`, e daria a um atacante com N contas N × a cota.
- **Decisão:** (i) `rateLimit.storage: 'database'` no Better Auth, reaproveitando o PostgreSQL —
  nenhum serviço novo, custo de reversão mínimo; exige a tabela `rate_limit` no schema Drizzle.
  (ii) O `@fastify/rate-limit` continua **antes** do `authPlugin` e a ordem de registro do
  `buildApp()` **não muda**; o ramo morto é removido e a chave passa a ser explicitamente o IP,
  opcionalmente combinada com um hash estável do token de sessão presente no header ou no cookie,
  que está disponível no `onRequest` sem nenhum acesso ao banco. (iii) Armazenamento compartilhado
  do limitador Fastify vira configuração, não código: `RATE_LIMIT_REDIS_URL` presente liga o store
  Redis; ausente mantém o contador local.
- **Consequência:** escalar horizontalmente passa a ser uma variável de ambiente. Enquanto
  `RATE_LIMIT_REDIS_URL` não for definida, **produção roda com réplica única** — restrição que
  F5-S08 registra no runbook de deploy. A forma normativa do `keyGenerator` na spec `04` §4 é
  substituída pela spec `08` §8.

### D-56 · Swagger UI só fora de produção; `openapi.json` continua artefato versionado

- **Data:** 2026-09-09 · **Sprint:** F5-S02 · **Status:** vigente
- **Contexto:** GAP-17. `swaggerPlugin` é registrado incondicionalmente, então `/docs` e o spec
  ficam públicos em produção, entregando o inventário completo de rotas e schemas. Agravante: o
  `helmet` aplica a CSP padrão em produção (`helmet.plugin.ts:8` passa `undefined`), que bloqueia
  os scripts inline do próprio Swagger UI — a interface está publicamente montada e provavelmente
  quebrada.
- **Opções consideradas:** (a) proteger `/docs` com Basic Auth e liberar a CSP para essa rota;
  (b) registrar o Swagger UI apenas fora de produção.
- **Decisão:** opção (b). `@fastify/swagger` (geração do spec) continua sempre registrado — é dele
  que `scripts/export-openapi.ts` depende (D-21). Só o `@fastify/swagger-ui` passa a ser
  condicional. Basic Auth adicionaria uma segunda forma de autenticação na API para servir
  documentação que já é pública no repositório como `docs/openapi.json`.
- **Consequência:** o contrato continua publicado, versionado e verificado no CI, sem superfície
  em produção e sem a exceção de CSP. `scripts/export-openapi.ts` precisa rodar com
  `NODE_ENV !== 'production'`, o que já é o caso em CI e em desenvolvimento.

### D-57 · Um único logger na aplicação; o mailer não instancia Pino próprio

- **Data:** 2026-09-09 · **Sprint:** F5-S03 · **Status:** vigente
- **Contexto:** GAP-15. `src/shared/email/mailer.ts:5-13` cria uma **segunda instância Pino sem
  `redact`**, fora do alcance de D-22, e em seguida extrai o `href` do corpo do e-mail e o registra
  em log. Num e-mail de reset, essa URL é o token válido por uma hora. O caminho do Resend loga o
  endereço do destinatário e o objeto de erro cru do provedor em `warn`, em produção.
- **Decisão:** a aplicação tem **um** logger, o do `buildApp()`. O mailer recebe um `Logger`
  injetado e, quando nenhum é fornecido (uso fora de requisição), usa uma instância que aplica
  **os mesmos `redact.paths` de D-22 acrescidos de `*.url`, `url` e `to`**. O transporte de memória
  pode continuar logando o link em `development` — é como se pega o token em dev — mas nunca em
  `test` nem em `production`, e nunca pelo transporte Resend.
- **Consequência:** D-22 deixa de ser uma propriedade do `app.ts` e passa a ser uma propriedade do
  projeto: qualquer módulo que precise logar usa o logger da aplicação. Um `pino()` novo em `src/**`
  passa a ser achado de auditoria na spec `08` §9.

### D-58 · Vínculo de contas sociais: e-mails diferentes permitidos, Facebook fora de `trustedProviders`, `freshAge` explícito

- **Data:** 2026-09-09 · **Sprint:** F5-S10 · **Status:** vigente
- **Contexto:** a rota coringa de `auth.plugin.ts:33-38` monta o handler inteiro do Better Auth, de
  modo que `GET /list-accounts`, `POST /link-social` e `POST /unlink-account` **já respondem** —
  sem estar no contrato da spec `03`, sem teste, sem sprint. Superfície não documentada é
  superfície não auditada. Quatro regras do runtime 1.7.2 governam essas rotas e nenhuma estava
  decidida:
  1. `account.mjs:213` e `callback.mjs:177` recusam vincular provedor cujo e-mail difere do e-mail
     da conta, a menos que `accountLinking.allowDifferentEmails === true`.
  2. `account.mjs:209` e `callback.mjs:173` recusam vincular provedor que não está em
     `trustedProviders` **e** não devolveu `emailVerified: true`.
  3. `unlinkAccount` (`account.mjs:266`) usa `freshSessionMiddleware`, e o `freshAge` default é
     86400 s (`create-context.mjs:148`) contra sessão de 7 dias — desvincular no 3º dia responde
     **403 `SESSION_NOT_FRESH`**.
  4. `account.mjs:280` recusa desvincular a **última** conta, salvo `allowUnlinkingAll`.
- **Decisão:**
  - **(a) `accountLinking.allowDifferentEmails: true`.** Vincular Google/GitHub cujo e-mail
    primário difere do e-mail de cadastro passa a ser permitido.
  - **(b) `trustedProviders` continua `['google', 'github']`.** A regra da spec `04` §1.1 —
    "o Facebook fica fora, mesmo depois do App Review" — **é reafirmada, não revogada**.
  - **(c) `session.freshAge: 60 * 60 * 24` declarado explicitamente** em `auth.config.ts`, em vez
    de herdado do default. O valor não muda; o que muda é ele deixar de ser implícito.
  - **(d) `allowUnlinkingAll` permanece ausente** (default `false`): ninguém fica sem método de
    login.
  - **(e) `updateUserInfoOnLink` permanece ausente** (default `false`).
  - **(f) As três rotas entram no contrato** como R46, R47 e R48 (spec `03` §2 e §5.1).
- **Consequência:**
  - **(a) é seguro porque vincular nunca altera identidade.** `applyUpdateUserInfoOnLink`
    (`link-account.mjs:319-331`) só roda com `updateUserInfoOnLink: true` — que a decisão (e)
    mantém desligado — e, mesmo ligado, **desestrutura `email` e `emailVerified` para fora** do
    update. O e-mail da conta é imutável por vínculo. O risco residual é o usuário perder o
    controle do provedor vinculado (e-mail corporativo devolvido, conta reciclada): quem receber
    aquela identidade de provedor entra na conta. Mitigação é o próprio `unlink`, que R48 expõe.
  - **(a) não afeta o caminho implícito.** `allowDifferentEmails` é lido apenas em `/link-social`
    e no callback com `state.link`. O auto-vínculo do `/sign-in/social` casa por e-mail
    (`link-account.mjs:63`), então lá os e-mails são iguais por construção.
  - **(b) significa que vincular Facebook responde `401 LINKING_NOT_ALLOWED` sempre — e isso é
    contrato, não defeito.** Verificado em `@better-auth/core/dist/social-providers/facebook.mjs`:
    pelo idToken (Limited Login) a lib fixa `emailVerified: false` (linha 102); pelo access token
    ela lê `profile.email_verified ?? false` (linha 130), e o `fields` da chamada ao Graph (linha 110) pede apenas `id,name,email,picture` — o campo nunca vem. **O Facebook nunca produz
    `emailVerified: true` neste stack.** Confiar nele seria aceitar o e-mail sem nenhum sinal de
    verificação, que é exatamente o sequestro descrito na spec `04` §1.1. O Facebook continua
    registrado como provedor de sign-in; só não é elegível a vínculo.
  - **(c) mantém o step-up.** Desvincular método de login é operação sensível e exige sessão com
    menos de 24 h. O cliente Flutter trata `403 SESSION_NOT_FRESH` reautenticando por
    `POST /sign-in/email` e repetindo a chamada — contrato em spec `03` §5.1 (R48).
    O alcance da chave são **duas rotas**: `freshSessionMiddleware` é usado por
    `/unlink-account` (`account.mjs:266`) e por `/list-sessions` (`session.mjs:343`) — esta
    segunda responde pela coringa mas não está no contrato. O terceiro consumidor de `freshAge`, o
    `/delete-user` nativo (`update-user.mjs:335`), não é usado: `DELETE /api/v1/me` (R15) é código
    próprio do módulo `users`.
  - **Pré-requisito de banco:** o índice `account_provider_account_unique` de F5-S04 (GAP-16). A
    decisão de vínculo é read-then-write sem guarda no banco (`link-account.mjs`), e sem o índice
    dois callbacks concorrentes duplicam a identidade do provedor. **F5-S10 não roda antes de
    F5-S04.**

### D-59 · Especificação OpenAPI 3.0.3 versionada, servers estáticos e documentação de Better Auth

- **Data:** 2026-09-09 · **Sprint:** F5-S01 · **Status:** vigente
- **Contexto:** a transformação do contrato da API em artefato versionado (`docs/openapi.json`) com verificação contínua no CI (D-21) exigiu resolver três fatores de estabilidade e completude:
  1. Versão do OpenAPI emitida pelo `@fastify/swagger` v9 com `fastify-type-provider-zod`;
  2. Definição do bloco `servers` sem causar diffs espúrios decorrentes de variáveis de ambiente (`env.BETTER_AUTH_URL`) entre máquinas de desenvolvimento e runners de CI;
  3. Tratamento das rotas de autenticação (`/api/auth/*`), que são montadas dinamicamente pelo Better Auth através de handler curinga com Fetch API (D-45) e não geram esquemas Zod nativos no Fastify.
- **Decisão:**
  - **(a) Versão OpenAPI:** fixada e validada em `3.0.3`.
  - **(b) Servers:** fixado estaticamente em `[{ url: 'http://localhost:3333', description: 'Local' }]`. Não utiliza variáveis de ambiente para preservar determinismo de exportação (diff zero em qualquer host).
  - **(c) Rotas do Better Auth:** permanecem gerenciadas exclusivamente pelo handler curinga do Better Auth em `auth.plugin.ts` e omitidas do mapa de rotas Zod do Fastify; são documentadas textualmente em `info.description` informando suporte simultâneo a Bearer Token e Cookie HttpOnly.
  - **(d) Determinismo de Exportação:** garantido através de ordenação recursiva alfabética de chaves de objetos em `scripts/export-openapi.ts` (`sortObjectKeys`).
- **Consequência:** `docs/openapi.json` é perfeitamente estável e determinístico. O CI roda `pnpm openapi:export -- --check` bloqueando PRs que alterem schemas sem atualizar o artefato versionado.

### D-60 · `trustProxy` por profundidade E validação do peer; número é proibido

- **Data:** 2026-09-09 · **Sprint:** F5-S02 · **Status:** vigente
- **Contexto:** o `fastify@5.12.1` (`lib/request.js:51-55`) passou a tratar `trustProxy`
  numérico como _fail closed_ (`return function () { return false }`), com a justificativa de
  que a contagem de saltos sozinha não valida o peer imediato. Com um número, a aplicação
  atrás da Railway atribuiria o IP do balanceador a todos os clientes e o limitador global
  colapsaria num único bucket. Já um predicado que só conta saltos, sem olhar o endereço,
  devolve ao cliente direto a capacidade de escolher o próprio IP via `X-Forwarded-For` —
  medido: socket `198.51.100.9` com `XFF: 9.9.9.9` resulta em `req.ip = 9.9.9.9`.
- **Decisão:** `trustProxy` recebe o predicado
  `(address, hop) => hop < TRUST_PROXY_HOPS && isTrustedProxy(address, TRUSTED_PROXY_LIST)`,
  construído por `buildTrustProxy(env)` em `src/shared/utils/client-ip.ts`. Devolve `false`
  quando `TRUST_PROXY_HOPS === 0` ou a lista de CIDRs está vazia. **`trustProxy` numérico e
  `trustProxy: true` são proibidos** (este último já por D-50).
- **Consequência:** as duas variáveis do D-50 continuam com função real — `TRUST_PROXY_HOPS`
  limita a profundidade, `TRUSTED_PROXIES` valida o peer. `req.ip` é confiável para o rate
  limit e para os logs. `client-ip.ts` deixa de ser código sem consumidor.

### D-61 · Migração de produção roda no `preDeployCommand` da Railway, nunca no runner do GitHub

- **Data:** 2026-09-11 · **Sprint:** F5-S08 · **Status:** vigente · **emenda a spec `06` §7**
- **Contexto:** a spec `06` §7 e o brief de F5-S08 mandavam o `deploy.yml` rodar
  `railway run pnpm db:migrate:deploy`. O `railway run` executa o comando **na máquina local** —
  aqui, o runner do GitHub Actions — apenas injetando as variáveis do serviço. A `DATABASE_URL`
  do addon Postgres da Railway aponta para `*.railway.internal`, endereço da rede privada do
  projeto, que não resolve fora dela. O step falharia em connection timeout em todo deploy, e a
  falha só apareceria no primeiro push em `main`, depois de toda a infraestrutura paga e
  configurada.
- **Opções consideradas:** (a) manter a migração no runner apontando o step para o proxy TCP
  público da Railway — muda uma linha e preserva a ordem prometida, ao custo de expor o Postgres
  à internet e de guardar mais uma credencial de banco no GitHub; (b) declarar `preDeployCommand`
  no `railway.json`, fazendo a migração rodar dentro do próprio container, na rede privada, com
  a imagem que está subindo.
- **Decisão:** opção (b). `railway.json` ganha
  `"preDeployCommand": "node dist/db/migrate.js"`. O `deploy.yml` perde o step de migração e
  passa a ter apenas `railway up --service cardoso-sound-api --detach` seguido do smoke test em
  `/health/ready`. O Postgres **não** recebe domínio público, e o proxy público não é usado em
  lugar nenhum do pipeline.
- **Consequência:** a ordem deixa de ser `deploy → migrate → smoke` e passa a ser
  `build → migrate → cutover → smoke`, que é estritamente melhor: a Railway só direciona
  tráfego para a nova versão se o `preDeployCommand` sair com código 0, então uma migração
  quebrada aborta o rollout em vez de deixar a versão nova servindo contra um schema velho.
  O `COPY drizzle ./drizzle` do `Dockerfile` deixa de ser conveniência e vira dependência dura
  do ciclo de deploy. A premissa de migração aditiva e retrocompatível **continua valendo** —
  durante o `preDeployCommand` a versão anterior ainda está no ar servindo tráfego. O runner do
  GitHub não precisa mais de `pnpm install` nem `pnpm build`: o `deploy.yml` fica com checkout,
  CLI da Railway e `curl`.

### D-62 · Domínio próprio desde o primeiro deploy; `BETTER_AUTH_URL` é imutável na prática

- **Data:** 2026-09-11 · **Sprint:** F5-S08 · **Status:** vigente
- **Contexto:** D-54 deriva o `rpID` do Passkey/WebAuthn de `BETTER_AUTH_URL`. O `rpID` é parte
  da identidade da credencial no autenticador: trocar o host faz o autenticador deixar de
  devolver toda passkey registrada sob o host anterior — não há migração, só novo registro.
  A mesma variável governa o prefixo `__Secure-` do cookie de sessão, as `callbackURL` do
  Better Auth e as redirect URIs registradas nos três provedores OAuth. Subir em
  `*.up.railway.app` e trocar para domínio próprio depois significa invalidar passkeys,
  reconfigurar três painéis OAuth e reemitir o contrato OpenAPI.
- **Opções consideradas:** (a) subir no subdomínio da Railway e migrar depois, registrando a
  invalidação como dívida; (b) esperar o domínio e subir já com ele.
- **Decisão:** opção (b). O primeiro deploy usa o domínio próprio. `BETTER_AUTH_URL` recebe
  `https://api.<domínio>` e passa a ser tratada como **imutável**: mudá-la é um evento de
  migração com ADR próprio, não um ajuste de variável. O mesmo domínio serve o DNS do Resend
  (D-51 tornou a verificação de e-mail obrigatória, e o remetente precisa de domínio
  verificado), então a compra do domínio já era pré-requisito de produção por outro caminho.
- **Consequência:** F5-S08 fica bloqueado até o domínio existir, com DNS do Resend verificado e
  o custom domain apontado para o serviço da Railway. Em troca, nenhuma credencial de usuário
  nasce órfã. O bloco `servers` de `docs/openapi.json` passa a precisar da URL de produção —
  mudança em `src/plugins/swagger.plugin.ts` e `scripts/export-openapi.ts` que **não** cabe no
  blast radius de F5-S08 (que não toca `src/**`): é trabalho de F5-S09, e continua estático e
  determinístico, respeitando D-59 (b).

### D-63 · `v1.0.0-rc.1` leva `develop` para `main`; `v1.0.0` continua sendo o portão de F5-S09

- **Data:** 2026-09-11 · **Sprint:** F5-S08 · **Status:** vigente · **complementa D-08** · **emendada por D-64** (o `v1.0.0-rc.1` passa a ser o release candidate de F7)
- **Contexto:** `main` está parada em `816c7fe release: v0.1.0 (#12)`, 34 commits atrás de
  `develop`, e **nenhuma tag existe no repositório** — `v0.1.0`…`v0.4.0` nunca foram criadas,
  apesar de o `PROGRESS.md` registrar `v0.4.0` como "preparada". O `deploy.yml` dispara em
  `push` na `main`, então não há deploy possível sem antes levar os 34 commits para lá. A
  tabela da spec `06` §6 só prevê `v1.0.0` para a Fase 5, e `v1.0.0` é o portão de F5-S09 —
  a auditoria dos 27 GAPs e o hardening final.
- **Opções consideradas:** (a) tag intermediária `v0.5.0`, que não existe na tabela de fases e
  exigiria uma linha nova nela; (b) pré-release `v1.0.0-rc.1`, que não consome o `v1.0.0` nem
  cria degrau novo no ciclo de fases.
- **Decisão:** opção (b). Um único release `release/v1.0.0-rc.1` a partir de `develop`, **depois**
  de F5-S08 ter sido mergeada em `develop`, leva os commits e o `deploy.yml` para `main` no
  mesmo push — que é o que dispara o primeiro deploy. Tag anotada `v1.0.0-rc.1` e GitHub Release
  marcada como pré-release. O back-merge `main → develop` da spec `06` §6 continua obrigatório.
  `v1.0.0` sai em F5-S09, sem GAP aberto, como D-49 e D-08 já determinam.
- **Consequência:** o primeiro push em `main` é o gatilho do deploy, então **toda a
  infraestrutura precisa existir antes do merge** — projeto Railway, addon Postgres, custom
  domain, token da Railway no GitHub, e as variáveis do §5.2 do brief preenchidas. As tags
  `v0.2.0`, `v0.3.0` e `v0.4.0` **não serão criadas retroativamente em `main`**: `main` nunca
  conteve aquele código, e fabricar tags apontando para commits que nunca estiveram na branch de
  produção é registro falso. A deriva fica registrada aqui; o histórico por fase continua
  legível em `PROGRESS.md` e nos PRs.

### D-64 · Roadmap passa de 5 para 7 fases: F6 (áudio próprio) e F7 (deploy e release)

- **Data:** 2026-09-11 · **Sprint:** — (decisão do dono) · **Status:** vigente · **emenda D-49 e D-63**
- **Contexto:** o áudio do catálogo aponta para `soundhelix.com`, domínio de terceiro, com ~16
  arquivos servindo 40 faixas. Colocar isso em produção significa depender da disponibilidade e
  dos termos de um terceiro para a demonstração inteira, e entregar um catálogo em que o áudio
  repete. A migração para a Cloudflare R2 estava registrada como "decidida, não implementada" em
  `.claude/memory/handoff-migracao-audio-r2.md` desde 2026-09-04 — documento que, por D-24, não
  vincula. Enfiar essa migração como sprint de follow-up dentro da F2 (que está selada) ou da F5
  (que é de produção) subordina um bloco de trabalho real a uma fase cujo objetivo é outro.
- **Opções consideradas:** (a) sprint de follow-up `F2-S05` na fase de catálogo, executada fora de
  ordem numérica — proposta da §9.2 do guia `docs/guides/analise-migracao-audio-cloudflare-r2.md`;
  (b) fase própria para o áudio, empurrando o deploy para uma fase seguinte.
- **Decisão:** opção (b). O roadmap passa a ter **sete fases**:

  | Fase | Objetivo                                 | Tag      |
  | ---- | ---------------------------------------- | -------- |
  | F5   | Blindagem, hardening e auditoria         | `v0.5.0` |
  | F6   | Áudio e imagem próprios na Cloudflare R2 | `v0.6.0` |
  | F7   | Deploy na Railway e release              | `v1.0.0` |

  O atual `F5-S08` (Deploy na Railway) passa a ser **`F7-S01`**, e o atual `F5-S09` (hardening,
  auditoria e release) se divide: a auditoria dos 27 GAPs fecha a **F5** com `v0.5.0`, e o release
  fecha a **F7** com `v1.0.0`.

- **Consequência:** `v1.0.0` passa a significar "no ar, com catálogo próprio", que é mais honesto
  do que "auditado mas nunca publicado" — a crítica que D-63 já registrava. **D-63 é emendada:** o
  `release/v1.0.0-rc.1` que leva `develop` para `main` passa a ser o release candidate de **F7**,
  não de F5. **D-49 é emendada** na contagem: o projeto sai de 25 sprints em 5 fases para 7 fases,
  com o total a fixar quando os briefs de F6 e F7 forem escritos. A tabela da spec `06` §6 ganha
  as linhas de F6 e F7. Nenhuma memória de sprint fechada é reescrita — renumeração atinge apenas
  F5-S08 e F5-S09, que nunca foram executadas.

### D-65 · Áudio próprio na Cloudflare R2 como storage estático — Caminho A

- **Data:** 2026-09-11 · **Sprint:** F6 · **Status:** vigente · **emenda D-10 e a Consequência de D-28**
- **Contexto:** promoção do handoff de 2026-09-04 a decisão vinculante, que é o que o `CLAUDE.md`
  listava como pendência aberta. O handoff mapeou seis alternativas (manter SoundHelix, Spotify,
  previews iTunes/Deezer, YouTube, Jamendo/CC, R2) e escolheu a R2 por entregar faixa completa,
  egress zero, catálogo autocontido e URL estática.
- **Opções consideradas:** (a) **Caminho A** — R2 é só storage: bucket público sob domínio próprio,
  upload por script versionado, o seed grava as URLs, a API continua read-only; (b) **Caminho B** —
  a API gerencia o ciclo de vida do áudio, com presigned PUT, CRUD de catálogo e RBAC; (c) Caminho A
  com entrega assinada, bucket privado e `audioUrl` de curta duração emitida pelo service.
- **Decisão:** opção (a), **Caminho A**. A API **nunca fala com a R2** — devolve uma string que já
  está no banco, e o cliente Flutter baixa direto do CDN. **D-09 e D-10 permanecem intactas na
  decisão**; de D-10 muda apenas o host citado ("toca direto do SoundHelix" → "toca direto do CDN
  próprio"). A base pública do CDN vive em `src/config/constants.ts` como `CDN_BASE_URL` — é valor
  público, determinístico e igual em todo ambiente, logo é constante, não variável de ambiente.
  `src/config/env.ts` e `.env.example` **não mudam**.
- **Consequência:** **nenhum segredo novo entra na superfície de produção** — as credenciais S3 da
  R2 vivem só na máquina do dono, para o upload. O seed continua offline e determinístico, e a
  suíte continua sem rede. **Hotlink livre é aceito conscientemente**: a defesa (Token Auth ou URL
  assinada) violaria D-10, e a opção (c) foi descartada por isso. A _Consequência_ de **D-28** é
  reescrita — "o SoundHelix só publica ~16 URLs distintas, o áudio repete e isso é aceito" deixa de
  ser verdade com 40 arquivos únicos; a _Decisão_ de D-28 (8 artistas, 40 faixas, ≥5 por gênero,
  idempotência) permanece. `durationSeconds` passa a ser **derivado do arquivo real**, e não mais
  inventado — o que torna T17 uma prova de verdade pela primeira vez.

### D-66 · O acervo é do dono; crédito e licença ficam fora do contrato da API

- **Data:** 2026-09-11 · **Sprint:** F6 · **Status:** vigente
- **Contexto:** o catálogo tem 8 artistas e 40 títulos **fictícios**. Servir gravação de terceiro
  sob esses nomes num bucket público soma distribuição não autorizada e atribuição falsa, com o
  repositório público no GitHub apontando para o bucket. O guia
  `docs/guides/analise-migracao-audio-cloudflare-r2.md` §4 levantou isso como o risco que trava a
  fase, e ele é jurídico, não técnico.
- **Opções consideradas:** (a) acervo de terceiros sob licença livre (CC0, domínio público, CC-BY),
  com CC-BY exigindo crédito e portanto colunas novas em `tracks` (`license`, `attribution`,
  `source_url`), migração e mudança de contrato; (b) acervo do próprio dono, sem obrigação de
  atribuição a terceiros.
- **Decisão:** opção (b). **Os 40 arquivos são do dono**, que os sobe ele mesmo. Faixa de terceiro
  só entra sob CC0 ou domínio público — CC-BY e CC-BY-SA ficam **fora**, justamente para não
  arrastar obrigação de crédito para dentro do payload. O crédito e a proveniência, quando
  existirem, vivem em `docs/` e no `README.md`, **nunca** no contrato da API.
- **Consequência:** `tracks` **não ganha coluna nenhuma** — sem migração, sem mudança no payload
  `Track`, sem regerar `docs/openapi.json` por causa de licença. O schema fica como está. Se um dia
  entrar acervo CC-BY, isso é fase própria com ritual de decisão completo, não item enxertado.
  A aplicação é de portfólio e fica no ar por cerca de uma semana; o bucket some junto com a demo.

### D-67 · Capas e avatares migram junto; o catálogo fica autocontido

- **Data:** 2026-09-11 · **Sprint:** F6 · **Status:** vigente
- **Contexto:** além dos 40 `audioUrl` no SoundHelix, o payload carrega 40 `coverUrl` e 8
  `avatarUrl` apontando para `images.unsplash.com`. Medido: são 40 _ocorrências_ de `coverUrl` mas
  apenas **8 URLs distintas** (uma por artista), mais 8 avatares — **16 imagens distintas**, um
  terço do que o handoff estimava.
- **Opções consideradas:** (a) migrar só o áudio e deixar as imagens no Unsplash, aceitando que o
  payload continue apontando para dois domínios de terceiros; (b) migrar as 16 imagens junto.
- **Decisão:** opção (b). O bucket recebe `tracks/`, `covers/` e `artists/`, e **nenhum domínio de
  terceiro sobra no payload**. Como são 16 imagens e não 48, o custo não justifica adiar.
- **Consequência:** o bucket fica com 40 objetos de áudio + 16 de imagem. `artists.data.ts` entra
  no blast radius da fase junto com `tracks.data.ts`, e `CDN_BASE_URL` passa a ter dois
  consumidores — o que confirma a escolha de `constants.ts` sobre uma constante local em
  `tracks.data.ts`. Volume estimado ~250 MB, dentro dos 10 GB gratuitos; custo esperado US$ 0.

### D-68 · Convenção de nomes em `cardosolabs.space`: escopo por projeto, CDN compartilhado

- **Data:** 2026-09-11 · **Sprint:** F6 / F7 · **Status:** vigente · **emenda D-62**
- **Contexto:** `cardosolabs.space` é domínio compartilhado, destinado a hospedar várias
  demonstrações — APIs, web apps e trabalhos de faculdade. A convenção de host entra em ~56 URLs
  do seed, em `BETTER_AUTH_URL`, no `CORS_ORIGIN`, no DNS do Resend e no custom domain da R2. Queimar
  `api.` no primeiro projeto obriga o segundo a inventar outra convenção — e, por D-62,
  `BETTER_AUTH_URL` é imutável na prática, então renomear depois invalida passkeys.
- **Opções consideradas:** (a) `api.` e `cdn.` diretos, mais curtos, mas que consomem os dois nomes
  mais genéricos do domínio no primeiro projeto; (b) escopo por projeto no host da API, com um CDN
  compartilhado e prefixo de pasta por projeto; (c) um subdomínio próprio por projeto com CDN
  aninhado, isolando tudo ao custo de mais DNS e mais um custom domain na R2 por projeto.
- **Decisão:** opção (b).

  | Papel   | Host                                                            |
  | ------- | --------------------------------------------------------------- |
  | API     | `https://sound-api.cardosolabs.space`                           |
  | CDN     | `https://cdn.cardosolabs.space`                                 |
  | Objetos | `cdn.cardosolabs.space/cardoso-sound/{tracks,covers,artists}/…` |

  Um bucket R2 e um custom domain servem todos os projetos; cada projeto é um prefixo de pasta.
  `CDN_BASE_URL` em `src/config/constants.ts` recebe `https://cdn.cardosolabs.space/cardoso-sound`.
  `*.r2.dev` é **proibido** em produção — é rate-limited e a própria Cloudflare desaconselha.

- **Consequência:** **D-62 é emendada** com o valor concreto: `BETTER_AUTH_URL` de produção é
  `https://sound-api.cardosolabs.space`, e é ela que governa o `rpID` do passkey (D-54). O DNS do
  Resend é verificado na zona `cardosolabs.space` e passa a servir todos os projetos do domínio.
  A zona precisa estar **na Cloudflare** — sem isso não há custom domain para o bucket. Nome do
  objeto: `<artist-slug>--<title-slug>.<ext>`, minúsculas ASCII, não-alfanumérico vira `-`, hifens
  colapsados, sem hífen nas pontas. O prefixo do artista faz o namespace do CDN espelhar a
  constraint `UNIQUE (artist_id, title)` do banco, em vez da unicidade global de título, que hoje é
  acidental. Objeto é **imutável**: áudio novo é slug novo — é o que autoriza
  `Cache-Control: public, max-age=31536000, immutable` no upload.

- **Emenda (2026-09-11), fechando §10.3 e §10.4 do handoff de F6/F7:** o bucket chama-se
  **`cardosolabs-media`** e é **um só para todos os projetos**
  do domínio. Não é preferência: um custom domain da R2 conecta a **um** bucket, então
  `cdn.cardosolabs.space/<projeto>/…` só existe com bucket único e prefixo de pasta. Um bucket por
  projeto exigiria um host por projeto (`cdn-sound.…`), mais um registro DNS e mais um token de API
  cada, contrariando a opção (b) acima. **Regra de CORS no bucket fica fora de escopo:** o cliente
  Flutter é **nativo (Android/iOS)**, e app nativo não faz requisição sujeita a CORS. O passo P0.11
  do runbook de F6 deixa de existir. A condição que reabre isto é única e deve constar na spec
  `09-midia-e-cdn.md`: **um build Flutter Web**. Nesse dia, e só nesse dia, cria-se a regra de CORS
  no bucket restrita à origem do app — nada a ver com `CORS_ORIGIN` da API, que é configuração do
  Fastify e não da R2.

### D-69 · Duração das faixas vem de `music-metadata` (devDependency); `ffprobe` fica fora do projeto

- **Data:** 2026-09-11 · **Sprint:** F6-S02 · **Status:** vigente
- **Contexto:** D-65 exige que os 40 `durationSeconds` do seed sejam **derivados dos arquivos MP3
  reais**, não copiados dos valores do SoundHelix — é a única coisa que faz `T17`
  (`120 ≤ durationSeconds ≤ 380`, `tests/integration/seed.test.ts:127-128`) valer alguma coisa.
  O script de ingestão precisa ler duração de MP3. Medido nesta árvore: **nem `ffprobe` nem `ffmpeg`
  existem nesta máquina** (`command -v` em ambos, ausente).
- **Opções consideradas:** (a) `ffprobe` do `ffmpeg` do sistema — zero dependências no repositório e
  nenhum ADR de dependência, mas exige `apt install ffmpeg` (~300 MB) que o próximo clone não
  herda, e torna o passo não reprodutível fora desta máquina; (b) `music-metadata` como
  **devDependency** — JS puro, sem binário externo, script autocontido, testável e executável em
  qualquer clone e no CI, ao custo de uma dependência nova.
- **Decisão:** opção (b), **`music-metadata` como `devDependency`**. O script de ingestão é código
  versionado do projeto; fazê-lo depender de um binário instalado à mão contraria a mesma lógica que
  fez o `allowBuilds` do D-32 existir. A precisão do `music-metadata` em MP3 degrada em VBR sem
  cabeçalho Xing — caso que **P0.6 já elimina** ao exigir CBR 128–192 kbps na normalização.
- **Consequência:** `package.json` e `pnpm-lock.yaml` entram no blast radius de F6-S02. A duração é
  lida do arquivo e **arredondada para segundos inteiros** antes de virar `durationSeconds`; nenhum
  valor antigo é copiado. Se alguma faixa cair fora de `120…380 s`, a correção é o **áudio** (P0.7),
  não o teste — mexer em `T17` exige emenda declarada no brief, nunca descoberta em execução.
  `ffmpeg` permanece fora: não é dependência do projeto nem pré-requisito de nenhum runbook.

### D-70 · `tsconfig.json` passa a incluir `scripts/**/*.ts`

- **Data:** 2026-09-11 · **Sprint:** F6-S02 · **Status:** vigente
- **Contexto:** `tsconfig.json:23` declara
  `include: ["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.mts"]` — **`scripts/` não está
  lá**. `scripts/export-openapi.ts` só é typechecked por acidente, porque
  `tests/integration/openapi.test.ts:6` o importa. Um `scripts/ingest-media.ts` novo, sem teste que
  o importe, **passa batido por `pnpm typecheck`** — um portão do DoD que silenciosamente não cobre
  o arquivo.
- **Opções consideradas:** (a) acrescentar `scripts/**/*.ts` ao `include`, fechando a lacuna para
  todo script presente e futuro; (b) exigir, por convenção, um teste que importe cada módulo de
  `scripts/` — resolve o script da vez e deixa o próximo escapar do mesmo jeito.
- **Decisão:** opção (a). `include` passa a
  `["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "*.config.ts", "*.config.mts"]`.
- **Consequência:** `tsconfig.json` entra no blast radius de F6-S02, e o typecheck de `scripts/`
  deixa de depender de um import de teste. Hoje o risco é nulo: `scripts/` contém apenas
  `export-openapi.ts` (já coberto) e `agent-security/`, que é shell, não TypeScript.
  Isto **não** estende a `scripts/` o bloco de ESLint escopado em `files: ['src/**/*.ts']`: o
  script de ingestão continua podendo ler credenciais da R2 de `process.env` legitimamente, e o
  `no-console` continua não se aplicando a ele. Não é exceção nem gambiarra — é a fronteira correta
  entre aplicação e ferramenta de linha de comando.

### D-73 · A F5 encerra-se como fase de autenticação; a F7 é a última fase e concentra deploy, auditoria e release

- **Data:** 2026-09-11 · **Sprint:** — (decisão do dono) · **Status:** vigente · **emenda D-64, D-49 e D-63**
- **Contexto:** D-64 tirou o deploy da F5 mas deixou a F5 com um sprint de fechamento, `F5-S09`,
  que ainda carregaria "a auditoria dos 27 GAPs". Na prática **os 27 GAPs já estavam fechados** em
  F5-S02…F5-S07 e F5-S10 (PRs #29–#36, `PROGRESS.md` de 2026-09-11), e o brief de `F5-S09` continuava
  se intitulando "Release `v1.0.0`", se declarando "último sprint do projeto" e "depende de F5-S08" —
  três afirmações que D-64 tornou falsas. Restava um sprint sem trabalho próprio e um brief que
  contradizia o ADR vigente. Já `F5-S08` vivia numa pasta (`fase-5-producao/`) cuja fase não o
  contém mais.
- **Opções consideradas:** (a) reescrever o brief de `F5-S09` para cobrir só a auditoria e fechar a
  F5 com um sprint próprio — mantém a simetria "toda fase termina num sprint", mas cria um sprint
  cujo conteúdo é reconferir o que os PRs #29–#36 já provaram; (b) encerrar a F5 nos sprints já
  mergeados e mover auditoria, README final e release inteiros para a F7.
- **Decisão:** opção (b).

  1. A **F5 é a fase de autenticação e blindagem** e está **completa** com F5-S01…F5-S07 e F5-S10.
     Fecha em `v0.5.0` sem sprint adicional.
  2. `docs/sprints/fase-5-producao/F5-S09-hardening-e-release.md` é **removido**. Seu escopo real
     (checklist da spec `08` §9 com evidência, `docs/AUDITORIA.md`, `README.md` reconciliado,
     `docs/FLUTTER.md`, tag `v1.0.0`) passa integralmente para **`F7-S02`**, ainda a escrever.
  3. `F5-S08-deploy-railway.md` vira `docs/sprints/fase-7-deploy/F7-S01-deploy-railway.md`, e o
     plano do agente vira `docs/agents-plans/plan-f7-s01-deploy-railway.md`. O conteúdo auditado em
     2026-09-11 (D-61, D-62, D-63, V4/V5 por D-56/D-51) é preservado: só a numeração muda.
  4. **A F7 é a última fase do projeto.**

- **Consequência:** o checklist da spec `04` §7 e o da spec `08` §9 passam a ser portão de
  **`F7-S02`**, não de `F5-S09` — e a evidência deles é colhida **contra a API no ar**, o que só é
  possível depois de `F7-S01`. Isso é mais forte que o arranjo anterior, em que a auditoria rodaria
  contra o ambiente local. `docs/sprints/README.md`, as specs `04`, `06` e `08`, `docs/issue/AUTHENTICATION.md`
  e `.env.example` são atualizados na mesma passada. `docs/report/SECURITY_SCORE.md` **não** é
  reescrito: é relatório datado de 2026-09-09 e recebe apenas nota de atualização no topo, pela
  mesma regra que proíbe reescrever memória de sprint fechada. Nenhum sprint executado é renumerado —
  `F5-S08` e `F5-S09` nunca rodaram. A reserva **D-71/D-72** para os ADRs de `F7-S01` continua de pé.
