# `.github/`

Automação do repositório: os workflows do GitHub Actions, a configuração do Dependabot e o template
de pull request.

> **Não normativo.** Este README é orientação. A especificação do pipeline é
> `.claude/rules/ci-deploy.md`, que por sua vez é subordinada a `.agents/memory/DECISIONS.md` e a
> `docs/specs/06-git-ci-cd.md`. Divergência entre este arquivo e a rule é bug deste arquivo — e um PR
> que mexe num workflow atualiza os dois no mesmo commit.

| Arquivo                    | Função                                  | Estado                        |
| -------------------------- | --------------------------------------- | ----------------------------- |
| `workflows/ci.yml`         | Portão de verificação de todo PR e push | ativo                         |
| `workflows/codeql.yml`     | Análise estática de segurança (SAST)    | ativo                         |
| `workflows/deploy.yml`     | Deploy na Railway                       | **0 bytes** — pendente F7-S01 |
| `dependabot.yml`           | Atualização de dependências e dos pins  | ativo                         |
| `pull_request_template.md` | Corpo padrão do PR                      | ativo                         |

---

## `workflows/ci.yml`

Dispara em `pull_request` e `push` contra `develop` e `main`, mais `workflow_dispatch` (permite
re-rodar a CI pela interface, sem commit vazio). `concurrency` cancela a execução anterior do mesmo
ref, economizando minuto de runner em pushes sucessivos num PR.

São seis jobs paralelos e um agregador:

| Job           | O que verifica                                               | Bloqueia? |
| ------------- | ------------------------------------------------------------ | --------- |
| `quality`     | matriz com `typecheck`, `lint` e `format:check`              | sim       |
| `test`        | `pnpm test` — as três suítes do `vitest.config.ts`           | sim       |
| `build`       | `pnpm build` e a existência dos três entry points em `dist/` | sim       |
| `contracts`   | `openapi:check` e o drift de migração do Drizzle             | sim       |
| `audit`       | `pnpm audit --prod --audit-level=high`                       | sim       |
| `secret-scan` | gitleaks sobre todo o histórico                              | sim       |
| `ci`          | agregador — é o _required status check_                      | —         |

### `quality`

Os mesmos comandos da Definition of Done do `CLAUDE.md`. A matriz existe para que o PR mostre qual
das três verificações quebrou, em vez de um job genérico vermelho. Nenhuma delas carrega
`src/config/env.ts`, então o job não precisa de variável de ambiente.

`format:check` é `prettier . --check` (verifica). `pnpm format` é `prettier . --write` (corrige) e
é o que você roda localmente — a CI nunca escreve no repositório.

### `test`

**Não existe bloco `services:` aqui, de propósito.** As suítes de integração e e2e sobem o próprio
`postgres:17-alpine` efêmero via Testcontainers (`tests/setup/testcontainers.ts`). Um service
container seria um segundo banco, conflitante.

É também por isso que o runner **precisa** ser `ubuntu-latest`: o Testcontainers depende do daemon do
Docker que vem nesse runner. Migrar para um job em container ou para um runner self-hosted sem Docker
mata integração e e2e silenciosamente — elas falham no harness, não numa asserção.

### `build`

Depois do `pnpm build`, confere que `dist/server.js`, `dist/db/migrate.js` e `dist/jobs/runner.js`
existem. Não é redundante com o build: o tsup roda com `bundle: false` (D-35) e faz glob de
`src/**/*.ts`, então esses três arquivos só existem enquanto o glob continuar casando com eles.
`dist/db/migrate.js` é o que a Railway executa no `preDeployCommand` (D-61) — se ele deixar de ser
emitido, a falha aparece aqui e não no meio de um deploy.

### `contracts`

Dois portões de artefato versionado, no padrão "gerar e conferir":

1. `pnpm openapi:check` — regenera a spec a partir das rotas e compara com `docs/openapi.json`.
2. `pnpm db:generate` seguido de `git diff --exit-code drizzle/` — se alguém editou uma tabela em
   `src/db/schema/**` sem gerar a migração, todos os outros portões passam e o deploy morre no
   `preDeployCommand`. Este job é o que pega isso antes.

`drizzle-kit generate` **não abre conexão**: ele compara os schemas com os snapshots em
`drizzle/meta/`. A `DATABASE_URL` do job só precisa ser uma URL sintaticamente válida porque
`drizzle.config.ts` importa `src/config/env.ts`, que é fail-fast.

> **Armadilha (D-39).** A extensão `pg_trgm` e os índices GIN são escritos à mão em
> `drizzle/0000_overconfident_overlord.sql`. Eles não estão nos snapshots, então o regenerate nunca
> os reproduz nem os reporta como drift. Se este portão ficar vermelho, a correção é rodar
> `pnpm db:generate` local, revisar o SQL e commitar — **nunca** apagar `drizzle/` e regenerar do
> zero, o que destrói o DDL manual.

### `audit`

Bloqueante. Nasceu advisory, com 9 advisories na árvore de produção (1 crítica, 2 high, 6 moderate);
dois upgrades limparam tudo acima do limiar em 20/09/2026:

- **`@fastify/swagger-ui` `^5.2.0` → `^6.1.1`** — a única que estava no caminho de requisição da API.
  O major 5 fixa `@fastify/static@^9`, e a correção do route guard bypass só existe no major 10, fora
  do alcance de qualquer override. Resolve `@fastify/static@10.1.4`.
- **`vitest` `^2.1.8` → `^4.1.11`** — o `better-auth` declara `vitest` e `drizzle-kit` como
  dependência de _runtime_, mas o pnpm deduplica para a **nossa** cópia. Ou seja: a crítica do
  `vitest` e a cadeia `vite` / `@vitest/mocker` embaixo dela eram nossas, não dele. Um bump de
  devDependency fechou seis achados.

Sobram duas advisories de `esbuild` (uma moderate, uma low), ambas **abaixo do limiar `high`** e
ambas de servidor de desenvolvimento. Uma vem da cadeia `@esbuild-kit`, deprecada upstream, que o
drizzle-kit ainda arrasta.

**Nunca suba o `--audit-level` para calar um achado.** Corrija a dependência ou registre aqui por que
ela é aceita.

`pnpm audit` lê o lockfile, então este job não roda `pnpm install`.

### `secret-scan`

O `.husky/pre-commit` roda só `lint-staged`, e os hooks de `.claude/` valem apenas dentro de uma
sessão do Claude Code — nenhum dos dois cobre o commit de um humano nem o PR de um fork. Este job
fecha esse buraco.

Usa o **CLI** do gitleaks, não a action: o wrapper `gitleaks-action` exige licença paga para
repositório de organização, enquanto o CLI é MIT. O binário é baixado numa versão fixa e o download é
conferido com `sha256sum` antes de executar.

`fetch-depth: 0` é obrigatório — sem isso a varredura vê só o commit de topo, não o histórico.

A allowlist fica em `.gitleaks.toml`, na raiz. Ela relaxa **apenas** a regra heurística
`generic-api-key` em fixtures de teste e nos registros de sprint (que citam os mesmos payloads),
via `targetRules`. As regras específicas de provedor continuam ativas nesses caminhos, então uma
credencial de verdade colada num arquivo de teste continua sendo pega.

### `ci` (agregador)

É o **required status check** do branch protection. Mantenha o id do job e o `name: ci`: a proteção
de branch está configurada contra esse nome exato, e renomear desliga o portão sem avisar.

Ele falha quando qualquer dependência reporta `failure`, `cancelled` **ou `skipped`** — um portão
obrigatório que não rodou não passou.

---

## `workflows/codeql.yml`

Análise estática de segurança da GitHub. É um workflow separado, e não um job do `ci.yml`, porque
tem `schedule` próprio: além de rodar em PR e push, roda semanalmente (segundas, 03:27 UTC), de modo
que consultas novas alcancem o código existente sem depender de alguém fazer um push.

Roda com `queries: security-extended` — o conjunto mais profundo — porque esta API carrega sessão,
passkey e 2FA. O repositório é público, então não há custo de GitHub Advanced Security.

`init` e `analyze` **precisam ficar na mesma versão**. Um par misturado falha com
`Loaded a configuration file for version X, but running version Y`. É por isso que o `dependabot.yml`
agrupa `github/codeql-action*` num PR só.

---

## `workflows/deploy.yml`

**Tem 0 bytes.** Quem escreve é o sprint `docs/sprints/fase-7-deploy/F7-S01-deploy-railway.md`, junto
com o `Dockerfile` e o `railway.json`. Os invariantes que ele precisa respeitar:

- **A migração de produção é o `preDeployCommand` da Railway** (`node dist/db/migrate.js`), nunca um
  step do runner (D-61). `railway run` executa localmente e a `DATABASE_URL` aponta para
  `*.railway.internal`, inalcançável a partir do runner.
- **Depender da CI verde** — hoje `ci.yml` e `deploy.yml` disparariam em paralelo num push em `main`,
  o que permitiria deployar com build vermelho. É a única lacuna conhecida ainda aberta do pipeline.
- `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` — PR nunca deploya.
- Token de deploy vindo de um GitHub **Environment** (`production`) com _required reviewers_: uma
  aprovação humana entre "build verde" e "a credencial é liberada ao job".
- Sempre `--service cardoso-sound-api`, senão um projeto com mais de um serviço deploya no errado.
- **Nunca rodar o seed.** Ele é idempotente (D-28), mas é uma operação manual e única; no
  `deploy.yml` reescreveria dado de produção a cada push.
- O workflow não instala dependência nem compila — o build acontece na Railway, a partir do
  `Dockerfile`.

---

## `dependabot.yml`

Três ecossistemas, todos com PR semanal às segundas:

- **`npm`** — dependências da aplicação. Updates de minor/patch são agrupados em dois PRs (um de
  `devDependencies`, um de produção) para reduzir ruído de revisão. Major vem em PR separado, porque
  merece leitura individual.
- **`github-actions`** — é o que mantém os pins por SHA dos workflows atualizados. Sem isso eles
  apodrecem em silêncio: antes deste arquivo existir, estavam três majors atrasados. O grupo
  `codeql-action` existe pelo motivo explicado acima.
- **`docker`** — imagem base do `Dockerfile`. Fica sem efeito enquanto o `Dockerfile` estiver vazio.

---

## `pull_request_template.md`

Corpo padrão do PR: sprint de origem, contratos entregues, testes, decisões registradas e o checklist
da Definition of Done.

> O checklist lista cinco portões (`typecheck · lint · format · test · build`) e está desatualizado
> em relação à CI, que hoje também roda `openapi:check`, o drift de migração e a varredura de
> segredo. Corrigir isso é um PR de uma linha, ainda não feito.

---

## Como mexer aqui

- **Toda action de terceiro é pinada por SHA de commit**, com a tag no comentário. Nunca copie um SHA
  de outro repositório ou de uma mensagem: resolva pela API.

  ```bash
  gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.sha + " " + .object.type'
  # se .object.type for "tag" (tag anotada, como a do pnpm/action-setup), desreferencie:
  gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'
  ```

  Pinar o objeto-tag em vez do commit falha em runtime.

- **O comando da CI é sempre o script do `package.json`**, nunca uma reimplementação inline da
  ferramenta com flags diferentes. Se falta script, adicione o script no mesmo PR.

- **Toda variável que virar obrigatória no boot precisa de um placeholder** nos jobs `test` e
  `contracts`, no mesmo PR. O sintoma de esquecer é a CI falhar com `Environment validation failed`
  num step que não toca banco nem provedor.

- **`BETTER_AUTH_SECRET` é gerado por execução** com `openssl rand -base64 32`, não escrito no
  arquivo. O step de geração precisa vir **antes** de qualquer step que carregue `src/config/env.ts`
  (`db:generate`, `openapi:check`).

- **`permissions` mínimo e explícito.** `contents: read` no nível do workflow; um job que precisa de
  mais declara só para si (o `analyze` do CodeQL faz isso com `security-events: write`).

- **Nunca `pull_request_target` para rodar código de PR.** Ele executa com o `GITHUB_TOKEN` e os
  secrets do repositório base mesmo em PR de fork.

- **Nunca interpole dado não confiável direto num `run:`.** Passe por `env:` e leia a variável dentro
  do shell.

- **`timeout-minutes` explícito em todo job**, senão um job travado consome o default de 6 horas.

## Rodando os portões localmente

```bash
pnpm typecheck && pnpm lint && pnpm format:check   # job quality
pnpm test                                          # job test (precisa de Docker)
pnpm build                                         # job build
pnpm openapi:check && pnpm db:generate             # job contracts
git diff --exit-code drizzle/
pnpm audit --prod --audit-level=high               # job audit
```

`pnpm format` corrige o que o `format:check` reprova.
