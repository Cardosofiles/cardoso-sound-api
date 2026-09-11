# Plano de Implementação — F7-S01: Deploy na Railway

> **Status:** 🟡 Planejamento revisado pelo Staff · Aguardando os pré-requisitos de infraestrutura (Etapa 3 do Protocolo — ⏸ PARADA 1)
> **Fase:** F7 — Deploy e release · **última fase do projeto** (D-64)
> **Branch Alvo:** `feature/f7s01-deploy-railway`
> **Depende de:** `F5-S07` (blindagem) e `F5-S10` (vínculo de contas sociais)
> **Entrega:** `Dockerfile` multi-stage, `railway.json` com `preDeployCommand`, `.github/workflows/deploy.yml`, validações de container e API no ar sob domínio próprio.
> **Decisões e Specs Normativas:**
>
> - `.agents/memory/DECISIONS.md` — **D-17**, **D-18**, **D-19**, **D-22**, **D-28**, **D-32**, **D-35**, **D-38**, **D-42**, **D-50**, **D-51**, **D-54**, **D-55**, **D-56**, **D-60**, **D-61**, **D-62**, **D-63**
> - `docs/specs/06-git-ci-cd-e-deploy.md` (§6 release, §7 Railway/Dockerfile/deploy.yml)
> - `docs/specs/04-autenticacao-e-seguranca.md` (§6)
> - `docs/specs/08-blindagem-de-seguranca.md` (§8.3 origens confiáveis)
> - `docs/specs/07-protocolo-dos-agentes.md`
> - `docs/sprints/fase-7-deploy/F7-S01-deploy-railway.md` (**brief normativo, revisão de 2026-09-11**)

---

## 0. Revisão do Staff — 2026-09-11

A primeira versão deste plano foi auditada antes da autorização. **Quatro defeitos foram
corrigidos e três decisões novas foram tomadas.** O que segue abaixo já incorpora tudo.

| #   | Defeito na v1 do plano                                                                   | Estado                                                   |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1  | `Dockerfile` não copiava `pnpm-workspace.yaml` → `ERR_PNPM_IGNORED_BUILDS`, build morria | corrigido na §4.1 — **verificado por build real**        |
| C2  | `railway run pnpm db:migrate:deploy` no runner do GitHub, contra `*.railway.internal`    | substituído por `preDeployCommand` (**D-61**)            |
| C3  | `V4` esperava Swagger UI carregando                                                      | é **404** (**D-56**) — o plano v1 já tinha acertado aqui |
| C4  | `V5` esperava `sign-up` + Bearer direto; `T12` usava `/health`, que é `allowList`        | reescritos como `T14` e `T12` (**D-51**, D-38)           |

| #        | Decisão nova                                              | Efeito neste plano |
| -------- | --------------------------------------------------------- | ------------------ |
| **D-61** | migração roda no `preDeployCommand`, não no runner        | §4.2 e §4.3        |
| **D-62** | domínio próprio desde o dia 1; `BETTER_AUTH_URL` imutável | §2 e §4.4          |
| **D-63** | `release/v1.0.0-rc.1` leva `develop` para `main`          | §7                 |

> **Evidência de C1.** `docker build` do Dockerfile da v1 falhou em ~8 s:
> `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@…, unrs-resolver@1.12.2`,
> nos estágios `deps` **e** `runner`. Com `pnpm-workspace.yaml` copiado, o build fecha verde,
> `/app/drizzle` lista os 6 `.sql` e o container roda como `uid=1000(node)`.

---

## 1. Contexto e diagnóstico

### 1.1 Objetivo

Colocar a `cardoso-sound-api` em produção na Railway sob **domínio próprio**, com PostgreSQL
provisionado, migrações aplicadas dentro do container antes do cutover, CD acionado em push na
`main`, e smoke test em `/health/ready`.

### 1.2 Diagnóstico factual do repositório

1. `Dockerfile`, `railway.json` e `.github/workflows/deploy.yml` existem na raiz com **0 bytes**.
2. `pnpm-workspace.yaml` existe e carrega o `allowBuilds` do **D-32** — é dependência do install.
3. `.dockerignore` **não** ignora `drizzle/` nem `pnpm-workspace.yaml`.
4. `src/db/migrate.ts` lê os `.sql` de `./drizzle` (relativo ao cwd) via `node dist/db/migrate.js`.
5. `src/server.ts` escuta em `env.HOST` (default `0.0.0.0`) e `env.PORT` — **nenhum ajuste em `src/**` é necessário**.
6. `src/config/env.ts` aborta o boot (`exit 1`) em produção sem `RESEND_API_KEY`, `TRUST_PROXY_HOPS ≥ 1` e `TRUSTED_PROXIES`.
7. `rate-limit.plugin.ts` isenta `/health*` do rate limit (D-38) — relevante para `T12`.
8. `swagger.plugin.ts` não registra o Swagger UI quando `NODE_ENV=production` (D-56).
9. `auth.config.ts` tem `requireEmailVerification: true` e `sendOnSignUp: true` (D-51).
10. `main` está 34 commits atrás de `develop`; **não existe nenhuma tag no repositório**.

---

## 2. Pré-requisitos do dono — bloqueiam a execução

O agente **não** cria conta, não compra domínio, não gerencia cobrança, não inventa credencial.
Os oito itens são a §1 do brief normativo. Se faltar qualquer um, **pare e peça**.

| #   | Pré-requisito                                                   | Onde                                                                      |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1  | Domínio próprio comprado                                        | registrador                                                               |
| P2  | DNS do domínio **verificado no Resend**                         | Resend → Domains → Add Domain → registros DKIM/SPF                        |
| P3  | Projeto Railway com addon PostgreSQL                            | **+ New** → Database → Add PostgreSQL                                     |
| P4  | Serviço nomeado **`cardoso-sound-api`**                         | o workflow usa `--service cardoso-sound-api`                              |
| P5  | Custom domain `api.<domínio>` no serviço                        | Settings → Networking → Custom Domain → CNAME                             |
| P6  | `RAILWAY_TOKEN` (**project token**) em GitHub Secrets           | Railway: Project Settings → Tokens. GitHub: `gh secret set RAILWAY_TOKEN` |
| P7  | `RAILWAY_URL` = `https://api.<domínio>` em GitHub **Variables** | `gh variable set RAILWAY_URL --body "https://api.<domínio>"`              |
| P8  | Credenciais OAuth de produção, redirect URIs no novo domínio    | painéis Google / GitHub / Facebook                                        |

> **P1, P2 e P5 bloqueiam o sprint inteiro (D-62).** `BETTER_AUTH_URL` governa o `rpID` do
> passkey (D-54): trocá-la depois invalida toda credencial já registrada. E sem domínio verificado
> no Resend ninguém conclui o cadastro (D-51).

> Se o push da branch com `.github/workflows/deploy.yml` for recusado com
> `refusing to allow an OAuth App to create or update workflow`, rode
> `gh auth refresh -h github.com -s workflow`.

---

## 3. Blast radius estrito

### 3.1 Preencher (0 bytes hoje)

```
Dockerfile
railway.json
.github/workflows/deploy.yml
```

### 3.2 Editar

```
.dockerignore                    # confirmar que drizzle/ e pnpm-workspace.yaml não são ignorados
README.md                        # seção de deploy, variáveis e URL pública
.agents/memory/DECISIONS.md      # D-71 e D-72 (§6)
.agents/memory/PROGRESS.md       # F7-S01 concluído + URL
.agents/memory/F7-S01.md         # memória do sprint
docs/agents-plans/plan-f7-s01-deploy-railway.md
```

### 3.3 Intocáveis

`src/**` · `scripts/**` · `docs/openapi.json` · `docs/specs/**` · `docker-compose.yml` ·
`.github/workflows/ci.yml`

### 3.4 Não-objetivos declarados

- **`servers` de produção no `docs/openapi.json`** — exige `src/plugins/swagger.plugin.ts` e
  `scripts/export-openapi.ts`. É F7-S02 (consequência de D-62).
- **Gatear `deploy.yml` no CI verde** — hoje `ci.yml` e `deploy.yml` disparam em paralelo no
  mesmo push. É F7-S02. Aqui, só registrar em `F7-S01.md`.

---

## 4. Especificação técnica dos artefatos

### 4.1 `Dockerfile` — multi-stage `node:24-alpine`

```dockerfile
# ------------------------------------------------------------------------------
# Stage 1: deps — dependências completas, com cache de layer
# ------------------------------------------------------------------------------
FROM node:24-alpine AS deps

WORKDIR /app

RUN corepack enable

# pnpm-workspace.yaml carrega o allowBuilds do D-32.
# Sem ele o pnpm 11 aborta com ERR_PNPM_IGNORED_BUILDS (esbuild, unrs-resolver).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: build — compilação TypeScript via tsup (bundle: false, D-35)
# ------------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsup.config.ts ./
COPY src ./src

RUN pnpm build

# ------------------------------------------------------------------------------
# Stage 3: runner — imagem final de execução
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist

# Migrações SQL — lidas pelo preDeployCommand (D-61). Dependência dura do deploy.
COPY drizzle ./drizzle

USER node

EXPOSE 3333

CMD ["node", "dist/server.js"]
```

**Garantias verificadas por build real (2026-09-11):**

- `pnpm-workspace.yaml` nos três estágios → install passa. Sem ele, falha em ~8 s.
- `/app/drizzle` contém `0000_*.sql` … `0005_*.sql` + `meta`.
- `id` no container → `uid=1000(node) gid=1000(node)`.
- Imagem final ≈ 650 MB.
- `require('../../package.json')` de `swagger.plugin` e `health.plugin` resolve para
  `/app/package.json` — por isso o `package.json` é copiado no estágio `runner`.

### 4.2 `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "preDeployCommand": "node dist/db/migrate.js",
    "healthcheckPath": "/health/ready",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

`preDeployCommand` roda **dentro do container que vai subir**, na rede privada, antes do cutover.
Código de saída ≠ 0 aborta o rollout com a versão anterior ainda servindo (**D-61**).
`healthcheckTimeout` em 300 s cobre pull da imagem + `preDeployCommand` + cold start.

### 4.3 `.github/workflows/deploy.yml`

```yaml
name: deploy

on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up --service cardoso-sound-api --detach

      - name: Smoke test readiness
        env:
          RAILWAY_URL: ${{ vars.RAILWAY_URL }}
        run: |
          if [ -z "${RAILWAY_URL}" ]; then
            echo "::error::RAILWAY_URL não está definida em GitHub Variables (P7)."
            exit 1
          fi
          echo "Pinging ${RAILWAY_URL}/health/ready..."
          for i in $(seq 1 36); do
            if curl -fsS "${RAILWAY_URL}/health/ready"; then
              echo ""
              echo "Serviço no ar e saudável."
              exit 0
            fi
            echo "Aguardando readiness (tentativa $i/36)..."
            sleep 5
          done
          echo "::error::Smoke test falhou: ${RAILWAY_URL}/health/ready não respondeu."
          exit 1
```

**Pontos de engenharia:**

- **Sem `pnpm install` e sem `pnpm build`.** O build acontece na Railway, a partir do `Dockerfile`;
  a migração é o `preDeployCommand`. Compilar no runner seria trabalho morto (mudança vinda de D-61).
- **Sem step de migração.** Reintroduzi-lo é regressão contra D-61.
- `cancel-in-progress: false` — não cancelar deploy no meio de migração.
- **Sem URL hardcoded de fallback.** `RAILWAY_URL` vazia falha o job na hora, em vez de fazer
  180 s de polling contra um domínio que não é o nosso.
- Polling de até 180 s absorve build + `preDeployCommand` + rollout.

### 4.4 Variáveis na Railway

⚠ = `src/config/env.ts` aborta o boot com `exit 1` se faltar em produção.

| Variável                             | Valor                                         | Motivo                                                                                 |
| ------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                           | `production`                                  | CORS restrito, rate limit global, log JSON (D-18, D-19)                                |
| ⚠ `DATABASE_URL`                     | `${{Postgres.DATABASE_URL}}`                  | rede privada do projeto; **não** usar a URL pública                                    |
| ⚠ `BETTER_AUTH_SECRET`               | `openssl rand -base64 32`                     | ≥ 32 chars, **exclusivo de produção**                                                  |
| ⚠ `BETTER_AUTH_URL`                  | `https://api.<domínio>`                       | cookie `__Secure-`, callbacks e `rpID` do passkey (D-54, D-62)                         |
| `CORS_ORIGIN`                        | origens do **cliente**, CSV sem curinga       | não é a URL da própria API — Swagger UI não existe em produção (D-56)                  |
| `MOBILE_DEEP_LINK`                   | esquema do app Flutter                        | entra em `trustedOrigins`; sem ele o `originCheck` rejeita deep links (spec `08` §8.3) |
| ⚠ `RESEND_API_KEY`                   | chave com o **domínio verificado** (P2)       | D-51 — sem entrega, ninguém completa o cadastro                                        |
| `EMAIL_FROM`                         | `Cardoso Sound <nao-responda@<domínio>>`      | o default `onboarding@resend.dev` só entrega para o dono da conta Resend               |
| ⚠ `TRUST_PROXY_HOPS`                 | `2` — confirmar com `T13`                     | D-50, D-60                                                                             |
| ⚠ `TRUSTED_PROXIES`                  | CIDRs privados da borda — confirmar com `T13` | D-50, D-60                                                                             |
| `LOG_LEVEL`                          | `info`                                        | —                                                                                      |
| `GOOGLE_*`, `GITHUB_*`, `FACEBOOK_*` | pares ID/secret de produção                   | sem eles `SOCIAL_PROVIDERS` fica vazio e F5-S03/F5-S10 sobem mortos                    |
| `PORT`                               | _(não definir)_                               | injetada pela Railway                                                                  |
| `RATE_LIMIT_REDIS_URL`               | _(não definir)_                               | D-55 — 1 réplica fixa, sem Redis                                                       |

**Réplicas:** fixar em **1** (Settings → Scaling). Sem Redis compartilhado, N réplicas multiplicam
o teto do rate limit por N (D-55).

**Ordem de configuração:** o domínio já existe antes do primeiro deploy (D-62/P5), então
`BETTER_AUTH_URL` é preenchida de uma vez. **Não existe mais** o ciclo "sobe → pega a URL →
redeploy" da v1 deste plano.

### 4.5 `.dockerignore`

Revisar e documentar as exclusões — `drizzle/` e `pnpm-workspace.yaml` **não** podem entrar aqui:

```
node_modules
dist
.git
tests
docs
.agents
coverage
*.md
.env*
# drizzle/ NÃO é ignorado — o preDeployCommand lê os .sql de /app/drizzle (D-61)
# pnpm-workspace.yaml NÃO é ignorado — carrega o allowBuilds do D-32
```

### 4.6 Seed manual em produção

Uma única vez, do terminal local autenticado:

```bash
railway run --service cardoso-sound-api tsx src/db/seed/seed.ts
```

Idempotente (D-28): 8 artistas, 40 faixas, 6 gêneros. **Fora do `deploy.yml`** — dado de produção
não se reescreve a cada push.

---

## 5. Matriz de testes

### 5.1 Locais, antes de qualquer push

| #      | Caso                      | Comando                                                          | Esperado                    |
| ------ | ------------------------- | ---------------------------------------------------------------- | --------------------------- |
| **T1** | Imagem builda             | `docker build -t cardoso-sound-api .`                            | exit 0                      |
| **T2** | Container sobe e responde | `docker run` com Postgres local + `curl localhost:3333/health`   | 200 `{"status":"ok",…}`     |
| **T3** | Imagem contém `drizzle/`  | `docker run --rm --entrypoint ls cardoso-sound-api /app/drizzle` | `0000_*.sql` … `0005_*.sql` |
| **T4** | Não roda como root        | `docker run --rm --entrypoint id cardoso-sound-api`              | `uid=1000(node)`            |

### 5.2 Em produção, após o release da §7

| #           | Caso                             | Como provar                                  | Aceite                                                          |
| ----------- | -------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **T5**      | Deploy dispara no push em `main` | GitHub Actions                               | job `deploy` verde                                              |
| **T6**      | Migrações aplicadas              | log do `preDeployCommand` no painel          | `0000` … `0005` aplicadas                                       |
| **T7 / V1** | Liveness                         | `curl https://api.<domínio>/health`          | 200 `{ status:'ok', uptime, version }`                          |
| **T7 / V2** | Readiness                        | `curl https://api.<domínio>/health/ready`    | 200 `{ status:'ready', database:'up' }` — **`ready`, não `ok`** |
| **T7 / V3** | Catálogo populado                | `curl '…/api/v1/tracks?limit=3'`             | 200, 3 faixas, `meta` do D-14                                   |
| **T7 / V4** | `/docs`                          | `curl -o /dev/null -w '%{http_code}' …/docs` | **404** (D-56)                                                  |
| **T7 / V5** | Cadastro                         | ver `T14`                                    | —                                                               |
| **T8**      | Smoke test falha o job           | quebrar uma variável ⚠ de propósito          | job falha; **reverter**                                         |
| **T9**      | Log JSON puro                    | painel de logs                               | sem cores, sem `pino-pretty` (D-18)                             |
| **T10**     | Log não vaza token/cookie        | provocar 401 e ler o log                     | `[REDACTED]` (D-22)                                             |
| **T11**     | CORS restrito                    | `curl -H 'Origin: https://evil.com' -I …`    | sem `Access-Control-Allow-Origin`                               |
| **T12**     | Rate limit ativo                 | ~150 requisições a **`/api/v1/tracks`**      | 429 após estourar a cota                                        |
| **T13**     | `req.ip` é o IP real             | ver abaixo                                   | dois clientes distintos → dois IPs distintos e reais            |
| **T14**     | Cadastro completo                | ver abaixo                                   | 200 no `/me`; 403 antes de verificar                            |

**`T12` não pode usar `/health`** — `rate-limit.plugin.ts:85` tem
`allowList: (req) => req.url.startsWith('/health')` (D-38). A v1 deste plano escolheu
`/health/ready` e o caso era inexequível.

**`T13` — prova de `trustProxy` (D-60).** `buildTrustProxy` só confia no `X-Forwarded-For` se o
peer imediato estiver em `TRUSTED_PROXIES`. Se os CIDRs não baterem com a borda real da Railway,
o predicado devolve `false`, `req.ip` vira o IP do balanceador **para todos os clientes** e o rate
limit global colapsa num bucket único — a falha exata que D-60 existe para evitar, e **silenciosa**.
Prova: duas requisições de dois IPs públicos diferentes (rede móvel e Wi-Fi), comparar o endereço
registrado nos logs estruturados. Iguais entre si ⇒ ajustar `TRUSTED_PROXIES` e repetir.
**Anotar o valor que funcionou em `F7-S01.md`.**

**`T14` — cadastro real com D-51 valendo.** Em produção não existe `outbox`:
`POST /api/auth/sign-up/email` → e-mail do Resend → abrir o link de verificação →
`POST /api/auth/sign-in/email` → Bearer → `GET /api/v1/me` → 200. Provar também o negativo:
`sign-in` antes de verificar responde **403**. E-mail que não chega ⇒ problema em P2, não no código.

---

## 6. Decisões a registrar em `DECISIONS.md`

Os números livres são **D-71** e **D-72** (D-61…D-70 já foram registrados pelo Staff):

1. **D-71 · Seed do catálogo em produção é manual e roda uma única vez**
   - Contexto: o catálogo precisa existir para o app Flutter, mas rodar o seed a cada push
     reescreveria dado de produção.
   - Decisão: execução manual via `railway run --service cardoso-sound-api tsx src/db/seed/seed.ts`,
     uma vez, após o primeiro deploy. Idempotente por D-28.

2. **D-72 · Sem rollback automático no pipeline de CD**
   - Contexto: rollback automático combinado com migração de banco pode corromper dado sem
     supervisão.
   - Decisão: falha no smoke test falha o job e para. O rollback é manual, pelo painel da Railway.
     Mitigado pelo `preDeployCommand` (D-61), que aborta o rollout antes do cutover quando a
     migração falha.

> **Não registre a ordem do pipeline** — já está em **D-61**.

---

## 7. Roteiro de execução (após autorização)

```
 1. Criar branch feature/f7s01-deploy-railway a partir de develop
 2. Dockerfile multi-stage — corepack, pnpm-workspace.yaml, USER node, COPY drizzle
 3. railway.json com preDeployCommand e healthcheck /health/ready
 4. .github/workflows/deploy.yml — sem install, sem build, sem step de migração
 5. Ajustar .dockerignore (comentários de drizzle/ e pnpm-workspace.yaml)
 6. Validar T1 (docker build local)
 7. Validar T3 (pasta drizzle no container)
 8. Validar T4 (uid do usuário node)
 9. Validar T2 (container + Postgres local, curl /health)
10. Portões completos: pnpm typecheck, lint, format, test, build
11. README.md — seção de Deploy, variáveis e URL pública
12. DECISIONS.md — D-64 e D-65
13. PROGRESS.md + .agents/memory/F7-S01.md
14. Commit convencional: "chore(deploy): configure Dockerfile, railway.json, and CD workflow"
15. Abrir PR para develop, aguardar CI verde e PARAR — o merge é do dono (D-06)
```

**O agente para no passo 15.** T5–T14 só são executáveis depois do release abaixo, que é do dono.

### Release e primeiro deploy — executado pelo dono (D-06, D-63)

```bash
git checkout develop && git pull
git checkout -b release/v1.0.0-rc.1
# ajusta version no package.json, atualiza PROGRESS.md
gh pr create --base main --title "release: v1.0.0-rc.1"
# merge manual — ESTE push é o gatilho do primeiro deploy;
# confirmar os oito pré-requisitos da §2 antes de clicar
git checkout main && git pull
git tag -a v1.0.0-rc.1 -m "Release candidate — deploy de produção"
git push origin v1.0.0-rc.1
gh release create v1.0.0-rc.1 --prerelease --notes "..."
git checkout develop && git merge --no-ff main && git push   # back-merge obrigatório
```

`v1.0.0` **não** sai aqui — é o portão de **F7-S02**, o último sprint do projeto (D-63, D-64).

---

## 8. Parada obrigatória (⏸ PARADA 1 — Etapa 3 do Protocolo)

Este plano está revisado e alinhado ao brief normativo. **Nenhuma linha de código ou configuração
será escrita antes de (a) os oito pré-requisitos da §2 estarem cumpridos e (b) autorização
explícita do dono.**
