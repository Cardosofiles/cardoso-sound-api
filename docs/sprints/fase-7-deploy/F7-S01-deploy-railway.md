# F7-S01 — Deploy na Railway

|                |                                                                       |
| -------------- | --------------------------------------------------------------------- |
| **Fase**       | F7 — Deploy e release · **última fase do projeto** (D-64)             |
| **Branch**     | `feature/f7s01-deploy-railway`                                        |
| **Depende de** | F5 completa (autenticação) e F6 completa (áudio próprio na R2 — D-65) |
| **Entrega**    | Dockerfile multi-stage, `railway.json`, `deploy.yml` e a API no ar    |
| **Revisado**   | 2026-09-11 — D-61/D-62/D-63; V4/V5 por D-56/D-51; renumerado por D-64 |

> **Revisão de 2026-09-11.** A versão anterior deste brief tinha quatro defeitos que o Staff
> corrigiu antes da execução: (1) o `Dockerfile` não copiava `pnpm-workspace.yaml` e o build
> falhava com `ERR_PNPM_IGNORED_BUILDS`; (2) a migração rodava no runner do GitHub contra a rede
> privada da Railway (D-61); (3) `V4` prometia Swagger UI em produção, contrariando **D-56**;
> (4) `V5` descrevia um sign-up que retorna Bearer, contrariando **D-51**
> (`requireEmailVerification: true`). Se você leu uma versão sem esta nota, pare e recarregue.

---

## 1. Pré-requisitos humanos — o agente não contorna nenhum

O agente **não** cria conta, não compra domínio, não gerencia cobrança e não inventa credencial.
Se qualquer linha abaixo estiver pendente, **pare e peça**.

| #   | Pré-requisito                                                    | Por quê                                                              |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| P1  | Domínio próprio comprado                                         | D-62 — `BETTER_AUTH_URL` é imutável na prática                       |
| P2  | DNS do domínio verificado no Resend                              | D-51 — verificação de e-mail é obrigatória                           |
| P3  | Projeto na Railway com addon Postgres provisionado               | banco de produção                                                    |
| P4  | Serviço nomeado **`cardoso-sound-api`**                          | o workflow usa `railway up --service cardoso-sound-api`              |
| P5  | Custom domain `api.<domínio>` apontado para o serviço            | D-62 — subir em `*.up.railway.app` e migrar depois invalida passkeys |
| P6  | `RAILWAY_TOKEN` (**project token**) em GitHub Secrets            | account token não resolve o projeto no CI                            |
| P7  | `RAILWAY_URL` em GitHub Variables (`https://api.<domínio>`)      | alvo do smoke test                                                   |
| P8  | Credenciais OAuth de produção, com redirect URIs no novo domínio | sem elas F5-S03 e F5-S10 sobem mortos                                |

> **P1, P2 e P5 bloqueiam o sprint inteiro.** Sem domínio verificado no Resend, ninguém consegue
> concluir o cadastro (D-51), e `V5`/`T14` são impossíveis de provar.

---

## 2. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Atenção especial a D-51, D-54, D-56, D-60, D-61, D-62 e D-63.

Sprint alvo: docs/sprints/fase-7-deploy/F7-S01-deploy-railway.md
Specs obrigatórias: docs/specs/06-git-ci-cd-e-deploy.md (§6 e §7),
                    docs/specs/04-autenticacao-e-seguranca.md (§6),
                    docs/specs/08-blindagem-de-seguranca.md (§8.3)

Antes de codar, confirme comigo os oito pré-requisitos da §1 deste sprint.
Sem todos os oito, pare.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 3. Objetivo

Colocar a API numa URL pública sob domínio próprio, com as migrações aplicadas dentro do
container antes do cutover, e um smoke test que falha o deploy se `/health/ready` não responder.

**Este é o sprint que faz o app Flutter funcionar fora da sua rede local.**

---

## 4. Contratos esperados

| Artefato                       | Conteúdo normativo                                                        |
| ------------------------------ | ------------------------------------------------------------------------- |
| `Dockerfile`                   | multi-stage `node:24-alpine`, spec `06` §7 — inclui `pnpm-workspace.yaml` |
| `railway.json`                 | builder DOCKERFILE, `preDeployCommand`, healthcheck `/health/ready`       |
| `.github/workflows/deploy.yml` | push em `main` → `railway up` → smoke test (a migração é da Railway)      |

Verificações finais contra `https://api.<domínio>`:

| #   | Verificação                  | Esperado                                                          |
| --- | ---------------------------- | ----------------------------------------------------------------- |
| V1  | `GET /health`                | 200 `{ status: 'ok', uptime, version }`                           |
| V2  | `GET /health/ready`          | 200 `{ status: 'ready', database: 'up' }` — **`ready`, não `ok`** |
| V3  | `GET /api/v1/tracks?limit=3` | 200 com 3 faixas do seed e o `meta` do D-14                       |
| V4  | `GET /docs`                  | **404** — Swagger UI não existe em produção (**D-56**)            |
| V5  | Fluxo de cadastro completo   | ver `T14` — sign-up **não** devolve Bearer utilizável (**D-51**)  |

> **V4 e V5 mudaram.** A versão anterior deste brief esperava Swagger UI carregando e um
> `sign-up` + `GET /me` com Bearer em uma tacada. As duas expectativas foram revogadas por
> D-56 e D-51 respectivamente. Não "conserte" o código para satisfazer o texto antigo.

---

## 5. Blast radius

### Preencher (0 bytes hoje)

```
Dockerfile
railway.json
.github/workflows/deploy.yml
```

### Editar

```
.dockerignore                # conferir que drizzle/ e pnpm-workspace.yaml NÃO são ignorados
README.md                    # seção de deploy e a URL pública
.agents/memory/DECISIONS.md  # D-71 e D-72 (§11)
.agents/memory/PROGRESS.md
.agents/memory/F7-S01.md
```

**Não toque em:** `.github/workflows/ci.yml` · qualquer `src/**` · `scripts/**` ·
`docs/openapi.json` · `docker-compose.yml` (é o ambiente local) · `docs/specs/**`.

### Não-objetivos declarados

- **`servers` de produção no `docs/openapi.json`.** Exigiria mexer em `src/plugins/swagger.plugin.ts`
  e `scripts/export-openapi.ts`, que estão fora do blast radius. É trabalho de **F7-S02**,
  já registrado na consequência de D-62.
- **Gatear o `deploy.yml` no CI verde.** Hoje `ci.yml` e `deploy.yml` disparam em paralelo no
  mesmo `push` em `main`. Resolver isso é F7-S02; aqui, apenas registre em `F7-S01.md`.

> Se `src/**` parecer precisar de ajuste para produção, **pare e reporte**. `src/server.ts` já
> escuta em `env.HOST` (default `0.0.0.0`) e `env.PORT` — não há ajuste pendente conhecido.

---

## 6. Passo a passo

### 6.1 `Dockerfile`

Três estágios. O que está comentado abaixo é obrigatório, não sugestão:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsup.config.ts ./
COPY src ./src
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3333
CMD ["node", "dist/server.js"]
```

Pontos que quebram o deploy se esquecidos:

| Item                       | Por quê                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `COPY pnpm-workspace.yaml` | carrega o `allowBuilds` do D-32. Sem ele, `ERR_PNPM_IGNORED_BUILDS` e o build morre nos estágios `deps` **e** `runner`. Medido em 2026-09-11 |
| `COPY drizzle ./drizzle`   | o `preDeployCommand` lê os `.sql` de lá; sem isso o rollout aborta (D-61)                                                                    |
| `USER node`                | não rodar como root                                                                                                                          |
| `ENV NODE_ENV=production`  | ativa CORS restrito, rate limit global e log JSON (D-18, D-19)                                                                               |
| pnpm via `corepack enable` | a versão vem de `packageManager`                                                                                                             |

Teste **local antes de subir** — `T1`, `T3` e `T4` da §7 rodam sem Railway e sem banco.

### 6.2 `railway.json`

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

`preDeployCommand` é o que substitui o antigo step de migração no workflow (D-61): roda dentro do
container que vai subir, na rede privada, e um código de saída diferente de 0 aborta o rollout com
a versão anterior ainda servindo. `healthcheckTimeout` subiu de 30 para 300 — 30 s não cobre
pull da imagem, `preDeployCommand` e cold start de Node com pool de conexão.

### 6.3 Variáveis na Railway

No painel do serviço. As marcadas com ⚠ fazem `src/config/env.ts` abortar o boot com `exit 1`
se faltarem em produção — o container não sobe, o healthcheck falha, o deploy é marcado como
falho.

| Variável                           | Valor                                                       | Motivo                                                                                    |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                         | `production`                                                | CORS restrito, rate limit global, log JSON                                                |
| ⚠ `DATABASE_URL`                   | referência ao addon Postgres (`${{Postgres.DATABASE_URL}}`) | rede privada; **não** use a URL pública                                                   |
| ⚠ `BETTER_AUTH_SECRET`             | `openssl rand -base64 32` — **valor novo, nunca o de dev**  | mínimo 32 chars                                                                           |
| ⚠ `BETTER_AUTH_URL`                | `https://api.<domínio>`                                     | cookie `__Secure-`, callbacks e `rpID` do passkey (D-54, D-62)                            |
| `CORS_ORIGIN`                      | origens do **cliente**, CSV, sem curinga                    | não é a URL da própria API: o Swagger UI não existe em produção (D-56)                    |
| `MOBILE_DEEP_LINK`                 | o esquema do app Flutter (ex.: `cardososound://`)           | entra em `trustedOrigins`; sem ele o `originCheck` rejeita os deep links (spec `08` §8.3) |
| ⚠ `RESEND_API_KEY`                 | chave do Resend com o **domínio verificado**                | D-51 — sem entrega de e-mail ninguém completa o cadastro                                  |
| `EMAIL_FROM`                       | `Cardoso Sound <nao-responda@<domínio>>`                    | o default `onboarding@resend.dev` só entrega para o dono da conta Resend                  |
| ⚠ `TRUST_PROXY_HOPS`               | `2` (ver `T13`)                                             | D-50, D-60                                                                                |
| ⚠ `TRUSTED_PROXIES`                | CIDRs privados da borda da Railway (ver `T13`)              | D-50, D-60 — valida o peer imediato                                                       |
| `LOG_LEVEL`                        | `info`                                                      | —                                                                                         |
| `GOOGLE_*` `GITHUB_*` `FACEBOOK_*` | pares ID/secret de produção                                 | sem eles `SOCIAL_PROVIDERS` fica vazio e F5-S03/F5-S10 sobem mortos                       |
| `PORT`                             | **não definir**                                             | injetada pela Railway                                                                     |
| `RATE_LIMIT_REDIS_URL`             | **não definir**                                             | D-55 — 1 réplica fixa, sem Redis                                                          |

**Réplicas:** fixe em **1** (Settings → Scaling). Sem Redis compartilhado, N réplicas multiplicam
o teto do rate limit por N (D-55).

**Ordem de configuração:** como o domínio já existe antes do primeiro deploy (D-62/P5),
`BETTER_AUTH_URL` pode ser preenchida de uma vez — **não** existe mais o ciclo
"sobe → pega a URL → redeploy" da versão anterior deste brief. Registre a ordem real em `F7-S01.md`.

### 6.4 `.github/workflows/deploy.yml`

```yaml
on:
  push: { branches: [main] }
permissions: { contents: read }
concurrency: { group: deploy-main, cancel-in-progress: false }
```

`cancel-in-progress: false` — cancelar um deploy no meio de uma migração é péssima ideia.

Passos: checkout → instalar a CLI da Railway → `railway up --service cardoso-sound-api --detach`
→ smoke test com polling em `$RAILWAY_URL/health/ready`.

**O workflow não instala dependências nem compila.** O build acontece na Railway a partir do
`Dockerfile`, e a migração é o `preDeployCommand` (D-61). Qualquer `pnpm install`/`pnpm build` no
runner é trabalho morto.

O smoke test lê `RAILWAY_URL` de GitHub Variables. **Se a variável estiver vazia, falhe o job
imediatamente** — não use URL hardcoded como fallback: ela transforma um erro de configuração em
120 s de polling contra um domínio que não é o seu.

Sem rollback automático: se o smoke test falhar, o job falha e o rollback é manual pelo painel da
Railway. Registre em `DECISIONS.md` (§10).

### 6.5 Seed em produção

O catálogo precisa existir. **Uma vez**, manualmente, do seu terminal autenticado:

```bash
railway run --service cardoso-sound-api tsx src/db/seed/seed.ts
```

O seed é idempotente (D-28), então repetir é inofensivo. **Não** coloque o seed no `deploy.yml`:
dado de produção não se reescreve a cada push. Registre a decisão (§10).

### 6.6 README

Acrescente a seção de deploy com a URL pública, a tabela de variáveis e o comando do seed.
Corrija "Como Rodar Localmente" se algo mudou.

---

## 7. Casos de teste obrigatórios

Sem Vitest — as provas são o container e o deploy real.

### Locais, antes de qualquer push (não precisam de Railway)

| #   | Caso                      | Como provar                                                         |
| --- | ------------------------- | ------------------------------------------------------------------- |
| T1  | Imagem builda             | `docker build -t cardoso-sound-api .` sai com código 0              |
| T2  | Container sobe e responde | `docker run` com Postgres local + `curl /health` → 200              |
| T3  | Imagem contém `drizzle/`  | `docker run --rm --entrypoint ls <img> /app/drizzle` lista 6 `.sql` |
| T4  | Não roda como root        | `docker run --rm --entrypoint id <img>` → `uid=1000(node)`          |

### Em produção, depois do release (§8)

| #   | Caso                                      | Como provar                                                                 |
| --- | ----------------------------------------- | --------------------------------------------------------------------------- |
| T5  | Deploy dispara no push em `main`          | run do `deploy.yml` verde                                                   |
| T6  | Migrações aplicadas                       | log do `preDeployCommand` no painel da Railway: `0000`…`0005`               |
| T7  | V1–V5 da §4                               | `curl` contra `https://api.<domínio>`                                       |
| T8  | Smoke test falha o job se a app não subir | quebre uma variável ⚠ de propósito, veja falhar, **reverta**                |
| T9  | Log é JSON, sem `pino-pretty`             | painel de logs                                                              |
| T10 | Log não contém token nem cookie           | provoque um 401 e leia os logs — `[REDACTED]` (D-22)                        |
| T11 | CORS restrito                             | `curl -H 'Origin: https://evil.com' -I` → sem `Access-Control-Allow-Origin` |
| T12 | Rate limit ativo                          | ~150 requisições rápidas a **`/api/v1/tracks`** → 429                       |
| T13 | `req.ip` é o IP real do cliente           | ver abaixo — **este é o teste que ninguém lembra de fazer**                 |
| T14 | Fluxo de cadastro completo                | ver abaixo                                                                  |

**`T12` não pode usar `/health`.** `rate-limit.plugin.ts:85` tem
`allowList: (req) => req.url.startsWith('/health')` — as sondas são isentas por D-38, e o teste
nunca produziria 429. A versão anterior deste brief não dizia a rota; o plano do agente escolheu
`/health/ready` e o caso era inexequível.

**`T13` — prova de `trustProxy` (D-60).** `buildTrustProxy` só confia no `X-Forwarded-For` se o
peer imediato estiver dentro de `TRUSTED_PROXIES`. Se os CIDRs declarados não baterem com a borda
real da Railway, o predicado devolve `false`, `req.ip` vira o IP do balanceador **para todos os
clientes**, e o rate limit global colapsa num bucket único — exatamente a falha que D-60 existe
para evitar. E ela é silenciosa: nada no log denuncia. Prova: faça duas requisições de dois IPs
públicos diferentes (rede móvel e Wi-Fi servem) e compare o `reqId`/`remoteAddress` nos logs
estruturados; os dois precisam ser IPs distintos e iguais aos IPs reais. Se forem iguais entre si,
ajuste `TRUSTED_PROXIES` e repita. **Registre o valor que funcionou em `F7-S01.md`** — é a única
fonte dessa informação para quem vier depois.

**`T14` — cadastro real, com D-51 valendo.** Em produção não existe `outbox`. A sequência é:
`POST /api/auth/sign-up/email` → chega e-mail do Resend → abrir o link de verificação →
`POST /api/auth/sign-in/email` → Bearer → `GET /api/v1/me` → 200. Prove também o lado negativo:
`sign-in` **antes** de verificar responde **403**. Se o e-mail não chegar, o problema é P2
(domínio no Resend), não código.

---

## 8. Release e primeiro deploy — executado pelo dono (D-06, D-63)

O agente **para** no PR para `develop`. O que vem depois é seu:

```bash
# 1. F7-S01 mergeada em develop, CI verde
git checkout develop && git pull

# 2. branch de release
git checkout -b release/v1.0.0-rc.1
# ajusta version no package.json, atualiza PROGRESS.md
gh pr create --base main --title "release: v1.0.0-rc.1"

# 3. você faz o merge — ESTE push é o gatilho do primeiro deploy.
#    Confirme os oito pré-requisitos da §1 antes de clicar.

# 4. tag e release
git checkout main && git pull
git tag -a v1.0.0-rc.1 -m "Release candidate — deploy de produção"
git push origin v1.0.0-rc.1
gh release create v1.0.0-rc.1 --prerelease --notes "..."

# 5. back-merge obrigatório (spec 06 §6)
git checkout develop && git merge --no-ff main && git push
```

`v1.0.0` **não** sai aqui — é o portão de **F7-S02**, o último sprint do projeto (D-63, D-64).

---

## 9. Definition of Done

```bash
docker build -t cardoso-sound-api .
docker run --rm --entrypoint ls cardoso-sound-api /app/drizzle
docker run --rm --entrypoint id cardoso-sound-api
# após o merge em main e o deploy:
curl -s https://api.<domínio>/health/ready | jq
curl -s 'https://api.<domínio>/api/v1/tracks?limit=3' | jq '.meta'
curl -s -o /dev/null -w '%{http_code}\n' https://api.<domínio>/docs   # espera 404
```

- [ ] T1–T14 verificados; T8 revertido
- [ ] V1–V5 respondendo sob o domínio próprio
- [ ] `T13` com o valor de `TRUSTED_PROXIES` que funcionou anotado em `F7-S01.md`
- [ ] Seed executado uma vez; catálogo com 8 artistas e 40 faixas
- [ ] `BETTER_AUTH_SECRET` de produção **diferente** do de desenvolvimento
- [ ] Nenhum segredo no repositório
- [ ] README com a URL pública e as instruções de deploy
- [ ] PR verde; memória atualizada

---

## 10. Armadilhas conhecidas

1. **`pnpm-workspace.yaml` fora da imagem** é a falha nº 1 e acontece no primeiro comando:
   `ERR_PNPM_IGNORED_BUILDS`. `T1` pega em 8 segundos.
2. **`drizzle/` fora da imagem** é a falha nº 2: o `preDeployCommand` falha com "no migrations
   folder" e a Railway aborta o rollout. `T3` pega isso.
3. **Migrar pelo runner do GitHub não funciona** — `railway run` executa local, e a
   `DATABASE_URL` é `*.railway.internal`. Ver D-61. Não "conserte" reintroduzindo o step.
4. **`PORT` sobrescrita** faz a Railway não achar o processo e marcar o deploy como falho.
5. **`RESEND_API_KEY` sem domínio verificado** — o boot passa (o Zod só exige o prefixo `re_`),
   o cadastro responde 200, e **nenhum e-mail chega**. Como D-51 exige verificação, o usuário
   fica preso no 403 do `sign-in` para sempre. Falha silenciosa e cara. `T14` pega.
6. **`CORS_ORIGIN` apontando para a própria API** não serve para nada: o Swagger UI não existe
   em produção (D-56). Ela existe para o cliente.
7. **Esquecer `MOBILE_DEEP_LINK`** faz o `originCheck` rejeitar os deep links do Flutter, e o
   sintoma aparece só no app, não no `curl`.
8. **Esquecer as credenciais OAuth** faz `SOCIAL_PROVIDERS` ficar vazio: as rotas de F5-S03 e
   F5-S10 sobem sem provedor nenhum. O `curl` no catálogo continua verde — nada denuncia.
9. **`TRUSTED_PROXIES` errado colapsa o rate limit em silêncio.** `T13` é o único detector.
10. **Reusar o `BETTER_AUTH_SECRET` de dev** invalida todas as sessões de produção a cada troca —
    e é um segredo que já circulou em `.env`.
11. **Trocar `BETTER_AUTH_URL` depois** invalida toda passkey registrada (D-54/D-62). É por isso
    que o domínio é pré-requisito, não etapa.
12. **`railway up` sem `--service`** pode subir no serviço errado num projeto com mais de um.
    Vale também para o `railway run` do seed.
13. **Token da Railway do tipo errado**: precisa ser **project token** do ambiente alvo. Com
    account token a CLI erra com "No linked project found".
14. **Seed no `deploy.yml`** reescreve dado de produção a cada push. Manual, uma vez.
15. **`ci.yml` e `deploy.yml` correm em paralelo** no mesmo push em `main` — dá para deployar
    sobre um CI vermelho. Fora do escopo aqui (§5), mas registre em `F7-S01.md`.

---

## 11. Registro na memória

- **`DECISIONS.md`** — **obrigatório**, próximos números livres:
  - **D-71** · seed do catálogo em produção é manual e roda uma única vez (não no pipeline).
  - **D-72** · ausência de rollback automático; falha no smoke test é rollback manual pelo painel.

  > A ordem do pipeline **já está decidida em D-61** — não registre de novo.

- **`PROGRESS.md`** — F7-S01 ✅, URL pública registrada, próximo = F7-S02.
- **`F7-S01.md`** — a ordem real de configuração das variáveis, o valor de `TRUSTED_PROXIES` que
  fez `T13` passar, o `docker build` local usado para validar, o tempo do deploy, e os dois
  itens de §5 adiados para F7-S02 (`servers` do OpenAPI e o gate de CI no deploy).
