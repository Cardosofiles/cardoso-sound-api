# 06 — Git, CI/CD e Deploy

---

## 1. Repositório

| Item             | Valor                              |
| ---------------- | ---------------------------------- |
| Nome             | `cardoso-sound-api`                |
| Dono             | `Cardosofiles`                     |
| Visibilidade     | **público** (D-05)                 |
| Acesso do agente | `gh` CLI **+** MCP `github` (D-02) |

Por ser público: **nenhum segredo entra no repo, em nenhum commit, nunca.** Um token
commitado e depois removido continua no histórico e é considerado vazado.

### Bootstrap (F1-S01, executado uma vez)

> **Já feito em 2026-09-03:** `gh` 2.46.0 instalado, autenticado como `Cardosofiles`,
> protocolo git = **SSH**, chave `~/.ssh/id_ed25519.pub` enviada à conta,
> `ssh -T git@github.com` respondendo. Escopos do token: `repo`, `read:org`, `gist`,
> `admin:public_key`. Comece direto do `git init`.

```bash
gh auth status                   # já autenticado — protocolo SSH
git init -b main
git add -A && git commit -m "chore: scaffold inicial do projeto"
gh repo create cardoso-sound-api --public --source=. --push
git checkout -b develop && git push -u origin develop
gh repo edit --default-branch develop
```

### Rulesets

`main` e `develop`, ambos com:

- push direto bloqueado (só via PR)
- 1 aprovação **ou** merge do próprio dono
- status check obrigatório: **`ci`**
- histórico linear (consequência do squash)

`gh ruleset` (2.46) é **somente leitura** — `list`, `view`, `check`. A criação é por
`gh api --method POST /repos/{owner}/{repo}/rulesets` ou pela interface web.

> ⚠️ **Escopo `workflow` ausente no token.** Empurrar uma branch que cria ou altera
> `.github/workflows/*.yml` por **HTTPS** é recusado pelo GitHub sem esse escopo. Como o
> protocolo configurado é SSH, a restrição não deve disparar — mas se F1-S04 ou F5-S02
> falharem com _"refusing to allow an OAuth App to create or update workflow"_, o conserto
> é uma linha:
>
> ```bash
> gh auth refresh -h github.com -s workflow
> ```

---

## 2. Git Flow

```
main        ●────────────────────●────────────────────▶  produção, só recebe release/hotfix
             ╲                  ╱ tag v0.1.0
develop     ──●──●──●──●──●──●──●──────────────────────▶  integração, alvo dos PRs
               ╲  ╱  ╲  ╱
feature/*       ●─●   ●─●                                 um por sprint
```

| Branch             | Sai de    | Volta para             | Quando                 |
| ------------------ | --------- | ---------------------- | ---------------------- |
| `main`             | —         | —                      | Só produção            |
| `develop`          | `main`    | —                      | Integração contínua    |
| `feature/<escopo>` | `develop` | `develop`              | **Um por sprint**      |
| `release/vX.Y.0`   | `develop` | `main` **e** `develop` | Fim de fase            |
| `hotfix/<bug>`     | `main`    | `main` **e** `develop` | Emergência em produção |

### Nome da branch de sprint

`feature/<f><s>-<slug-curto>` — derivado do id do sprint:

```
feature/f1s01-repositorio-e-gitflow
feature/f2s04-modulo-tracks
feature/f4s01-modulo-playlists
```

---

## 3. Conventional Commits

Validado por `commitlint` no hook `commit-msg`. Formato:

```
<tipo>(<escopo>): <descrição em minúscula, imperativo, sem ponto final>
```

| Tipo       | Uso                                            |
| ---------- | ---------------------------------------------- |
| `feat`     | Nova capacidade visível na API                 |
| `fix`      | Correção de bug                                |
| `refactor` | Muda estrutura sem mudar comportamento externo |
| `test`     | Adiciona ou corrige teste                      |
| `chore`    | Build, deps, config, tooling                   |
| `docs`     | Documentação, specs, memória                   |
| `ci`       | Workflows do GitHub Actions                    |

Escopos válidos: `setup`, `config`, `db`, `auth`, `tracks`, `artists`, `playlists`,
`favorites`, `users`, `health`, `plugins`, `tests`, `ci`, `deploy`, `docs`.

```
feat(tracks): adiciona busca por titulo album e artista com pg_trgm
fix(auth): repassa multiplos set-cookie do handler do better auth
test(playlists): cobre 404 para playlist de outro usuario
```

**Um sprint pode ter vários commits.** Eles são achatados em um só no squash merge, e a
mensagem do squash é o título do PR.

---

## 4. Pull Request

Título: `<tipo>(<escopo>): <sprint id> — <objetivo do sprint>`
Ex.: `feat(tracks): F2-S04 — módulo de faixas com busca e paginação`

Corpo obrigatório:

```markdown
## Sprint

F2-S04 — Módulo tracks · docs/sprints/fase-2-catalogo/F2-S04-modulo-tracks.md

## O que foi feito

- …

## Contratos entregues

- GET /api/v1/tracks (R06) · GET /api/v1/tracks/:id (R07) · GET /api/v1/genres (R08)

## Testes

- Unit: …
- Integração: …

## Decisões registradas

- D-xx: … (ou "nenhuma")

## Checklist

- [ ] typecheck · [ ] lint · [ ] format · [ ] test · [ ] build
- [ ] Casos obrigatórios do sprint cobertos
- [ ] PROGRESS.md atualizado · [ ] F<n>-S<nn>.md criado
- [ ] Nenhum arquivo fora do blast radius
```

Merge: **squash**, feito **por você** (D-06). O agente **nunca** faz merge.

---

## 5. CI — `.github/workflows/ci.yml`

Gatilhos: `pull_request` para `develop` e `main`; `push` em `develop` e `main`.

Job único chamado **`ci`** (é o nome exigido pelo ruleset), em `ubuntu-latest`:

```yaml
name: ci
on:
  pull_request: { branches: [develop, main] }
  push: { branches: [develop, main] }
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # versão vem de packageManager
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- **Bloqueante e completo** (D-07). Testcontainers funciona: o runner tem daemon Docker.
- `--frozen-lockfile` — lockfile desatualizado **falha** o build, de propósito.
- `concurrency` cancela runs antigas do mesmo PR.
- A partir de F5-S01 entra um passo extra: regenerar `docs/openapi.json` e falhar se
  `git diff --exit-code` acusar diferença.

### Como o agente verifica o CI

```bash
gh pr create --base develop --head "$BRANCH" --title "…" --body-file /tmp/pr.md
gh run watch --exit-status          # bloqueia até terminar; sai != 0 se vermelho
gh pr checks --watch                # alternativa equivalente
```

### Protocolo de CI vermelho

1. `gh run view --log-failed` para ler a falha real.
2. Corrigir **a causa**, nunca o sintoma. Commit `fix(...)` e push na mesma branch.
3. **Até 3 tentativas.** Na terceira falha o agente **para** e reporta no formato:
   ```
   🔴 CI vermelho após 3 tentativas — F2-S04
   Job/step: …    Erro: …    Hipótese: …    O que já tentei: …
   ```
4. **Nunca**: desabilitar o step, marcar `continue-on-error`, pular teste, ou fazer
   force-push para esconder histórico.

---

## 6. Releases

Uma tag por fase (D-08).

| Fase          | Tag      | Entrega                                             |
| ------------- | -------- | --------------------------------------------------- |
| F1 Fundação   | `v0.1.0` | Projeto compila, sobe, responde `/health`, CI verde |
| F2 Catálogo   | `v0.2.0` | Catálogo público consultável e populado             |
| F3 Identidade | `v0.3.0` | Cadastro, login e perfil                            |
| F4 Biblioteca | `v0.4.0` | Playlists e favoritos, suíte E2E                    |
| F5 Produção   | `v1.0.0` | Deploy na Railway, OpenAPI publicado                |

Procedimento (último sprint de cada fase):

```bash
git checkout develop && git pull
git checkout -b release/v0.2.0
# ajusta version no package.json, atualiza PROGRESS.md
gh pr create --base main --title "release: v0.2.0"
# você faz o merge
git checkout main && git pull
git tag -a v0.2.0 -m "Fase 2 — Catálogo" && git push origin v0.2.0
gh release create v0.2.0 --notes-file docs/sprints/fase-2-catalogo/RELEASE.md
git checkout develop && git merge --no-ff main && git push   # back-merge obrigatório
```

O **back-merge de `main` para `develop`** não é opcional — sem ele as branches divergem.

`docs/sprints/fase-<n>-<nome>/RELEASE.md` é escrito pelo **último sprint de cada fase**,
consolidando os `F<n>-S<nn>.md` daquela fase. Não existe antes disso.

---

## 7. Deploy — Railway (D-17)

### `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health/ready",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### `Dockerfile` — multi-stage, `node:24-alpine`

| Stage    | Faz                                                                                     |
| -------- | --------------------------------------------------------------------------------------- |
| `deps`   | `pnpm install --frozen-lockfile` (com cache de layer)                                   |
| `build`  | `pnpm build` → `dist/`                                                                  |
| `runner` | `--prod` deps + `dist/` + `drizzle/`; usuário não-root; `CMD ["node","dist/server.js"]` |

> `drizzle/` **precisa** ir para a imagem final — `db:migrate:deploy` lê os `.sql` de lá.

### `.github/workflows/deploy.yml`

Gatilho: `push` em `main`. Sequência:

1. `railway up --service cardoso-sound-api --detach` (token em `secrets.RAILWAY_TOKEN`)
2. `railway run pnpm db:migrate:deploy` — **migração antes do tráfego novo**
3. `curl -fsS "$RAILWAY_URL/health/ready"` — smoke test; falhou, o job falha

Variáveis no painel da Railway: `DATABASE_URL` (do Postgres do próprio projeto),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NODE_ENV=production`,
`LOG_LEVEL=info`.

### `docker-compose.yml` (desenvolvimento local)

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cardoso
      POSTGRES_PASSWORD: cardoso_dev
      POSTGRES_DB: cardoso_sound
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cardoso -d cardoso_sound']
      interval: 5s
      timeout: 5s
      retries: 10
volumes: { pgdata }
```

`DATABASE_URL` local correspondente:
`postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound`
