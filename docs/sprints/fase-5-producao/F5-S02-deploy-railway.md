# F5-S02 — Deploy na Railway

|                |                                                                    |
| -------------- | ------------------------------------------------------------------ |
| **Fase**       | F5 — Produção                                                      |
| **Branch**     | `feature/f5s02-deploy-railway`                                     |
| **Depende de** | F5-S01                                                             |
| **Entrega**    | Dockerfile multi-stage, `railway.json`, `deploy.yml` e a API no ar |

> **Pré-requisito humano:** conta na Railway com projeto criado, addon Postgres
> provisionado e `RAILWAY_TOKEN` salvo em GitHub Secrets. Se faltar qualquer um,
> **pare e peça** — o agente não cria conta nem gerencia cobrança.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-5-producao/F5-S02-deploy-railway.md
Specs obrigatórias: docs/specs/06-git-ci-cd-e-deploy.md (§7),
                    docs/specs/04-autenticacao-e-seguranca.md (§6)

Antes de codar, confirme comigo: (1) projeto Railway criado, (2) addon Postgres
provisionado, (3) RAILWAY_TOKEN em GitHub Secrets. Sem os três, pare.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Colocar a API numa URL pública, com migrações aplicadas antes de o tráfego novo entrar e
um smoke test que falha o deploy se `/health/ready` não responder.

**Este é o sprint que faz o app Flutter funcionar fora da sua rede local.**

---

## 3. Contratos esperados

| Artefato                       | Conteúdo normativo                                            |
| ------------------------------ | ------------------------------------------------------------- |
| `Dockerfile`                   | multi-stage `node:24-alpine`, spec `06` §7                    |
| `railway.json`                 | builder DOCKERFILE, healthcheck `/health/ready`, spec `06` §7 |
| `.github/workflows/deploy.yml` | push em `main` → deploy → migrate → smoke test                |

Verificações finais:

| #   | Verificação                               | Esperado                 |
| --- | ----------------------------------------- | ------------------------ |
| V1  | `GET https://<app>.up.railway.app/health` | 200                      |
| V2  | `GET .../health/ready`                    | 200, `database: 'up'`    |
| V3  | `GET .../api/v1/tracks?limit=3`           | 200 com 3 faixas do seed |
| V4  | `GET .../docs`                            | Swagger UI carrega       |
| V5  | Sign-up + `GET /me` com Bearer            | 200                      |

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
Dockerfile
railway.json
.github/workflows/deploy.yml
```

### Editar

```
.dockerignore                # garantir que drizzle/ NÃO seja ignorado
README.md                    # seção de deploy e a URL pública
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F5-S02.md
```

**Não toque em:** `.github/workflows/ci.yml` (pronto) · qualquer `src/**` ·
`docker-compose.yml` (é o ambiente local).

> Se `src/server.ts` precisar de ajuste para produção (ex.: `HOST` sempre `0.0.0.0`),
> **pare e reporte** — pode ser um ajuste legítimo, mas passa por autorização.

---

## 5. Passo a passo

### 5.1 Dockerfile

Três estágios (spec `06` §7):

```dockerfile
FROM node:24-alpine AS deps
# corepack + pnpm install --frozen-lockfile

FROM node:24-alpine AS build
# copia deps + fonte, roda pnpm build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
# instala só deps de produção
# COPY --from=build /app/dist ./dist
# COPY drizzle ./drizzle        <-- OBRIGATÓRIO
USER node
CMD ["node", "dist/server.js"]
```

Pontos que quebram deploy se esquecidos:

| Item                          | Por quê                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `COPY drizzle ./drizzle`      | `db:migrate:deploy` lê os `.sql` de lá; sem isso a migração falha em produção |
| `USER node`                   | não rodar como root                                                           |
| `NODE_ENV=production`         | ativa CORS restrito, rate limit e log JSON (D-18, D-19)                       |
| pnpm via `corepack enable`    | a versão vem de `packageManager`                                              |
| `.dockerignore` sem `drizzle` | conferir — o `.dockerignore` de F1-S01 pode estar excluindo                   |

Teste **local antes de subir**:

```bash
docker build -t cardoso-sound-api .
docker run --rm -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... -p 3000:3000 cardoso-sound-api
curl -s localhost:3000/health
```

### 5.2 Variáveis na Railway

No painel do serviço:

| Variável             | Valor                                                      |
| -------------------- | ---------------------------------------------------------- |
| `NODE_ENV`           | `production`                                               |
| `DATABASE_URL`       | referência ao addon Postgres do projeto                    |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — **valor novo, nunca o de dev** |
| `BETTER_AUTH_URL`    | a URL pública do serviço                                   |
| `CORS_ORIGIN`        | a URL pública (para o Swagger UI)                          |
| `LOG_LEVEL`          | `info`                                                     |
| `PORT`               | injetada pela Railway — **não sobrescreva**                |

> `BETTER_AUTH_URL` só existe depois do primeiro deploy gerar o domínio. Faça um deploy,
> pegue a URL, preencha, redeploy. Registre essa ordem no `F5-S02.md`.

### 5.3 `deploy.yml`

```yaml
on:
  push: { branches: [main] }
permissions: { contents: read }
concurrency: { group: deploy-main, cancel-in-progress: false }
```

`cancel-in-progress: false` — cancelar um deploy no meio de uma migração é péssima ideia.

Passos: checkout → setup → `railway up --service <nome> --detach` →
`railway run pnpm db:migrate:deploy` → `curl -fsS "$URL/health/ready"`.

A migração roda **depois** do deploy da imagem e **antes** do smoke test. Migração
compatível com a versão anterior é a premissa — todas as deste MVP são aditivas.

Se o `curl` falhar, o job falha. Sem rollback automático: registre isso em `DECISIONS.md`
e faça o rollback manual pelo painel da Railway se necessário.

### 5.4 Seed em produção

O catálogo precisa existir. **Uma vez**, manualmente:

```bash
railway run tsx src/db/seed/seed.ts
```

O seed é idempotente (D-28), então repetir é inofensivo. **Não** coloque o seed no
`deploy.yml`: dado de produção não deve ser reescrito a cada push. Registre a decisão.

### 5.5 README

Acrescente a seção de deploy com a URL pública, as variáveis necessárias e o comando do
seed. Corrija a seção "Como Rodar Localmente" se algo mudou.

---

## 6. Casos de teste obrigatórios

Sem Vitest — as provas são o deploy real:

| #   | Caso                                      | Como provar                                                        |
| --- | ----------------------------------------- | ------------------------------------------------------------------ |
| T1  | Imagem builda localmente                  | `docker build` sem erro                                            |
| T2  | Container sobe e responde                 | `docker run` + `curl /health`                                      |
| T3  | Imagem contém `drizzle/`                  | `docker run --rm --entrypoint ls <img> /app/drizzle`               |
| T4  | Container **não** roda como root          | `docker run --rm --entrypoint id <img>` → não é uid 0              |
| T5  | Deploy dispara no push em `main`          | run do `deploy.yml` verde                                          |
| T6  | Migrações aplicadas em produção           | tabelas existem (Railway console ou `railway run psql`)            |
| T7  | V1–V5 da §3                               | `curl` contra a URL pública                                        |
| T8  | Smoke test falha o job se a app não subir | quebre `BETTER_AUTH_SECRET` de propósito, veja falhar, **reverta** |
| T9  | Log em produção é JSON, sem pino-pretty   | ver o painel de logs                                               |
| T10 | Log **não** contém token nem cookie       | provoque um 401 e leia os logs (D-22)                              |
| T11 | CORS restrito em produção                 | requisição com `Origin` não permitido é bloqueada                  |
| T12 | Rate limit ativo                          | 150 requisições rápidas → aparece 429                              |

---

## 7. Definition of Done

```bash
docker build -t cardoso-sound-api .
docker run --rm --entrypoint ls cardoso-sound-api /app/drizzle
# após o merge em main e o deploy:
curl -s https://<app>.up.railway.app/health/ready | jq
curl -s 'https://<app>.up.railway.app/api/v1/tracks?limit=3' | jq '.meta'
```

- [ ] T1–T12 verificados; T8 revertido
- [ ] V1–V5 respondendo na URL pública
- [ ] Seed executado uma vez em produção; catálogo com 8 artistas e 40 faixas
- [ ] `BETTER_AUTH_SECRET` de produção **diferente** do de desenvolvimento
- [ ] Nenhum segredo no repositório (`git log -p | grep -iE '(ghp_|railway_|secret=)'` vazio)
- [ ] README com a URL pública e as instruções de deploy
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`drizzle/` fora da imagem** é a falha nº 1 deste sprint: o deploy sobe, a migração
   falha com "no migrations folder", e a API responde 500 em tudo. T3 pega isso.
2. **`.dockerignore` excluindo `drizzle`** — confira o arquivo escrito em F1-S01.
3. **`PORT` sobrescrita** faz a Railway não encontrar o processo e marcar o deploy como
   falho. Deixe a plataforma injetar.
4. **`HOST` diferente de `0.0.0.0`** faz o container escutar só em loopback e o
   healthcheck externo falhar.
5. **Reusar o `BETTER_AUTH_SECRET` de dev** invalida todas as sessões de produção a cada
   troca — e é um segredo que já circulou em `.env`. Gere um novo.
6. **Migração rodando antes do build terminar** aplica SQL de uma versão que ainda não
   está no ar. A ordem é: deploy → migrate → smoke.
7. **`railway up` sem `--service`** pode subir no serviço errado em projeto com mais de um.
8. **Seed no `deploy.yml`** reescreve dado de produção a cada push. Manual, uma vez.
9. **Free tier da Railway hiberna** o serviço. Se a demo precisar estar sempre no ar,
   é decisão de plano — **pare e pergunte**.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: seed manual (não no pipeline); ausência de
  rollback automático; ordem deploy → migrate → smoke.
- **`PROGRESS.md`** — F5-S02 ✅, URL pública registrada, próximo = F5-S03.
- **`F5-S02.md`** — a ordem de configuração das variáveis (§5.2), o `docker build` local
  usado para validar, e o tempo do deploy.
