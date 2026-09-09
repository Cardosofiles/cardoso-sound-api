# F5-S02 — Blindagem de Borda e Rate Limiting

|                |                                                                |
| -------------- | -------------------------------------------------------------- |
| **Fase**       | F5 — Produção · **1º dos 6 sprints de blindagem** (D-49)       |
| **Branch**     | `feature/f5s02-blindagem-de-borda`                             |
| **Depende de** | F5-S01                                                         |
| **Entrega**    | GAP-01, GAP-04, GAP-05, GAP-06, GAP-10, GAP-17, GAP-21, GAP-27 |

> **Este sprint contém o único achado CRÍTICO da auditoria.** `rate-limit.plugin.ts:8`
> implementa `global: env.NODE_ENV === 'development'` — a negação exata de D-19 e da spec `04`
> §4. Em produção o plugin registra e governa **zero rotas**.
>
> **Nenhuma rota nova, nenhuma migração, nenhuma dependência nova.** É configuração e três
> funções puras. É também o sprint de maior retorno por esforço do projeto inteiro.

---

## 0. Pré-requisitos

Nenhum trabalho humano bloqueante. Uma informação **desejável**, não bloqueante:

| Item                      | Onde se obtém                         | Se não tiver                                                                                                          |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CIDRs da borda da Railway | Railway → Project → Networking / docs | Use `10.0.0.0/8` no `.env.example` e **registre como pendência** — F5-S08 preenche o valor real nas Railway Variables |

O valor só é lido quando `NODE_ENV=production`. Em `development` e `test` o default vazio é o
correto, e a suíte não depende dele.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia com atenção D-19, D-49, D-50 e D-56 — elas decidem tudo o que este sprint faz.
Leia também .agents/memory/F1-S06.md (entregou os plugins de borda que você vai editar)
e .agents/memory/F3-S03.md (entregou o bloco rateLimit.customRules que você vai ampliar).

Sprint alvo: docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§2, §3.1, §3.3, §8.1),
                    docs/specs/04-autenticacao-e-seguranca.md (§4, §6)

A spec 08 SUBSTITUI os trechos marcados da spec 04. Onde as duas divergirem, vale a 08.

ANTES de escrever qualquer código, execute a §5.1 do sprint: confirme no código do pacote
instalado (node_modules/better-auth/dist/utils/ip.mjs) ou pelo MCP context7 a assinatura
exata de advanced.ipAddress.trustedProxies e advanced.ipAddress.ipAddressHeaders.
Reporte o que encontrou. Se a chave não existir com esse nome na versão instalada,
PARE e reporte — o sprint tem um fallback documentado na §5.4, mas quem decide sou eu.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fazer o rate limiting **existir** em produção, e fazer com que ele signifique alguma coisa.

Hoje ele falha em três camadas empilhadas, e é importante entender que são falhas
**independentes** — corrigir uma só não entrega nada:

1. **O limitador global do Fastify está desligado em produção** (GAP-01). Toda rota
   `/api/v1/**` está sem teto.
2. **A chave do limitador do Better Auth vem de um header que o cliente controla** (GAP-04).
   Mesmo o limitador que está ligado é contornável — ou, atrás da Railway, colapsa todo o tráfego
   num bucket só e vira negação de serviço contra os usuários legítimos.
3. **As regras estritas não cobrem os caminhos que importam** (GAP-05, GAP-06). O limite de 3
   resets por hora protege um alias e deixa o endpoint nativo em 600/hora; o login por senha não
   tem regra nenhuma.

Junto com isso, três correções pequenas e independentes que vivem nos mesmos arquivos: superfície
do Swagger em produção (GAP-17), literal com forma de segredo no CI (GAP-21) e o `x-request-id`
do cliente entrando nos logs sem limite (GAP-27).

**Não faz parte deste sprint:** armazenamento distribuído do rate limit (F5-S07) · a chave por
sessão (F5-S07) · `cookieCache` (F5-S04) · qualquer coisa de 2FA ou Passkey.

---

## 3. Contratos esperados

### 3.1 `src/config/env.ts` — duas variáveis novas

Forma normativa: **spec `08` §2.1**. `RATE_LIMIT_REDIS_URL` da mesma tabela **não** é deste
sprint — é de F5-S07. Declare apenas as duas:

| Variável           | Tipo Zod                       | Default | Obrigatória           |
| ------------------ | ------------------------------ | ------- | --------------------- |
| `TRUST_PROXY_HOPS` | `coerce.number().int().min(0)` | `0`     | **sim em production** |
| `TRUSTED_PROXIES`  | `string()` (CSV de CIDRs)      | `""`    | **sim em production** |

Derivado exportado, no mesmo lugar em que `CORS_ORIGIN_LIST` e `SOCIAL_PROVIDERS` já são
derivados — **não espalhe a lógica**:

```ts
export const TRUSTED_PROXY_LIST: string[]; // split ',', trim, remove vazios
```

E a interface `Env` ganha os dois campos mais `TRUSTED_PROXY_LIST: string[]`.

### 3.2 Três funções puras novas

```ts
// src/shared/utils/request-id.ts
export function resolveRequestId(raw: unknown): string;

// src/shared/utils/client-ip.ts
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  trustedProxies: readonly string[],
  socketIp: string,
): string;

// src/plugins/swagger.plugin.ts — exportada só para teste
export function shouldExposeSwaggerUi(nodeEnv: string): boolean;
```

Semântica exata de cada uma: **spec `08` §2.4** e **§8.1**. Elas existem porque configuração de
segurança que só se prova em produção não se prova nunca (spec `08` §1, princípio 4).

### 3.3 `src/plugins/rate-limit.plugin.ts` — opções extraídas

```ts
export function buildRateLimitOptions(config: Env): FastifyRateLimitOptions;
export const rateLimitPlugin: FastifyPluginCallback;
```

O plugin passa a ser uma casca de três linhas em volta de `buildRateLimitOptions(env)`. É essa
extração que torna o GAP-01 provável por teste unitário sem subir produção.

### 3.4 `src/modules/auth/auth.config.ts` — duas chaves

`advanced.ipAddress` (spec `08` §2.3) e `rateLimit.customRules` ampliado para **8 entradas**
(spec `08` §3.3, linhas até `/sign-in/social` inclusive). As 5 entradas de `two-factor` e
`sign-in/passkey` da spec **não** entram aqui — são de F5-S05 e F5-S06.

Exporte o objeto de regras como constante nomeada, para o T18 poder asseverá-lo:

```ts
export const AUTH_RATE_LIMIT_RULES = {/* ... */} as const;
```

### 3.5 Comportamento observável

| Situação                                                 | Antes             | Depois                       |
| -------------------------------------------------------- | ----------------- | ---------------------------- |
| `GET /api/v1/tracks` × 200 em produção                   | sem teto          | 429 a partir de 100/min      |
| `POST /api/auth/request-password-reset` × 10 em produção | 200 nas 10        | 429 a partir da 4ª na hora   |
| `POST /api/auth/sign-in/email` × 10 em produção          | 200/401 nas 10    | 429 a partir da 6ª no minuto |
| `X-Forwarded-For` forjado por cliente direto             | bucket novo       | ignorado; conta o IP real    |
| `GET /docs` com `NODE_ENV=production`                    | 200 (UI quebrada) | **404**                      |
| `X-Request-Id: <4 KB>`                                   | 4 KB por log      | truncado em 64               |

---

## 4. Blast radius

### Criar

```
src/shared/utils/request-id.ts
src/shared/utils/client-ip.ts
tests/unit/shared/utils/request-id.test.ts
tests/unit/shared/utils/client-ip.test.ts
tests/unit/plugins/rate-limit.plugin.test.ts
tests/unit/plugins/swagger.plugin.test.ts
tests/integration/auth-rate-limit.test.ts
```

### Editar

```
src/config/env.ts                   # 2 variáveis + TRUSTED_PROXY_LIST + superRefine
src/app.ts                          # trustProxy, genReqId, registro condicional do swagger-ui
src/plugins/rate-limit.plugin.ts    # buildRateLimitOptions + correção do `global`
src/plugins/swagger.plugin.ts       # shouldExposeSwaggerUi + UI condicional
src/modules/auth/auth.config.ts     # advanced.ipAddress + customRules (8 entradas)
.env.example                        # placeholders das 2 variáveis novas
.github/workflows/ci.yml            # remoção do literal com forma de segredo
tests/unit/config/env.test.ts       # casos novos das 2 variáveis
.agents/memory/PROGRESS.md
.agents/memory/F5-S02.md
```

**Não toque em:** `src/modules/auth/auth.plugin.ts` (a ponte não muda — GAP-04 se resolve na
config, não na ponte) · `src/db/**` · `drizzle/**` · `src/modules/{users,playlists,favorites,artists,tracks}/**` ·
`src/plugins/{cors,helmet,under-pressure,error-handler,health}.plugin.ts` ·
`src/shared/email/**` · `tests/e2e/**` · `docs/openapi.json`.

> **`DECISIONS.md` não está na lista de edição.** D-19, D-49, D-50 e D-56 **já estão
> registradas** — este sprint as executa, não as cria. Se você encontrar algo que exija decisão
> nova, **pare e pergunte**; não acrescente `D-NN` por conta própria.

> **`docs/openapi.json` não está na lista** porque nenhuma rota, schema ou resposta muda. Se o
> `--check` do CI acusar diferença, isso é sinal de que você mudou algo que não devia — investigue
> antes de regenerar.

---

## 5. Passo a passo

### 5.1 Confirmar a assinatura do Better Auth — antes de qualquer código

A auditoria observou, em `better-auth@1.7.2`:

- `dist/utils/ip.mjs:188-192,204` — `getIP` lê `["x-forwarded-for"]` por padrão e, sem
  `trustedProxies`, aceita o header de valor único como veio.
- `dist/utils/ip.mjs:226` — a chave de rate limit é montada como `ip|path`.
- `dist/rate-limiter/index.mjs:233,245` — sem IP confiável, a chave vira `no-trusted-ip|<path>`.

```bash
grep -n "trustedProxies\|ipAddressHeaders\|no-trusted-ip" \
  node_modules/.pnpm/@better-auth+core@*/dist/utils/ip.mjs \
  node_modules/.pnpm/@better-auth+core@*/dist/rate-limiter/index.mjs 2>/dev/null
grep -rn "trustedProxies" node_modules/better-auth/dist/ | head
```

**Reporte o que encontrou antes de codar.** Três desfechos possíveis:

- Assinatura confere → siga a §5.4 como está.
- Assinatura difere no nome ou no formato → **pare e reporte**. Não adapte por conta própria.
- A chave não existe → use o **fallback** da §5.4, e só ele.

### 5.2 `env.ts` — as duas variáveis

Acrescente ao `envSchema`, e a obrigatoriedade condicional **dentro do `superRefine` que já
existe**, junto da regra do `RESEND_API_KEY`. Forma exata: spec `08` §2.1.

Três cuidados:

- `TRUST_PROXY_HOPS` é **número de saltos**, não booleano. `trustProxy: true` no Fastify faz a
  aplicação confiar na cadeia inteira de `X-Forwarded-For` e devolve ao cliente a capacidade de
  forjar o próprio IP — exatamente o GAP-04 que este sprint fecha, reintroduzido pela porta dos
  fundos. **`true` é proibido** (D-50).
- A obrigatoriedade vale **só em `production`**. Em `development` e `test` os defaults `0` e `""`
  preservam o comportamento atual, e é isso que mantém a suíte determinística.
- `TRUSTED_PROXY_LIST` é derivado no mesmo `return` de `parseEnv` que já monta `CORS_ORIGIN_LIST`
  e `SOCIAL_PROVIDERS`.

`.env.example` recebe as duas com comentário explicando que são obrigatórias em produção:

```bash
# Topologia de proxy (D-50). Obrigatórias em produção; F5-S08 preenche os valores da Railway.
# 0 = sem proxy à frente (desenvolvimento local). Em produção, o número de saltos até a app.
TRUST_PROXY_HOPS=0
# CSV de CIDRs da borda confiável. Vazio fora de produção.
TRUSTED_PROXIES=
```

### 5.3 As funções puras

`resolveRequestId` (GAP-27) e `resolveClientIp` (GAP-04) — contratos na spec `08` §2.4.

Sobre `resolveClientIp`, o ponto que decide se está certo ou errado: a varredura é **da direita
para a esquerda**, e o primeiro salto que **não** pertence a nenhum CIDR confiável é o cliente.
Ler da esquerda para a direita é a forma clássica de errar isso, porque a esquerda é justamente a
parte que o cliente escreve. Se todos os saltos forem confiáveis, o cliente é o `socketIp`.

Para comparar IP contra CIDR, prefira `node:net` (`net.BlockList`), que é nativo e cobre IPv4 e
IPv6 — **não acrescente dependência** para isso. `BlockList.addSubnet()` + `check()` resolve.

`resolveRequestId` mantém o comportamento atual como fallback (`randomUUID().slice(0, 8)`).

### 5.4 `auth.config.ts` — `advanced.ipAddress`

```ts
advanced: {
  disableOriginCheck: false,          // inalterado
  ipAddress: {
    ipAddressHeaders: ['x-forwarded-for'],
    trustedProxies: TRUSTED_PROXY_LIST,
  },
},
```

**Fallback autorizado**, e apenas se a §5.1 provar que `trustedProxies` não existe na versão
instalada:

```ts
advanced: {
  disableOriginCheck: false,
  ipAddress: {
    getIP: (req) => resolveClientIp(headersOf(req), TRUSTED_PROXY_LIST, socketIpOf(req)),
  },
},
```

Mesma função pura da §5.3, mesmos testes. Se nem `getIP` existir, **pare** — o sprint não tem
terceira via, e improvisar aqui é o mesmo que não corrigir.

### 5.5 `customRules` — as 8 entradas

```ts
export const AUTH_RATE_LIMIT_RULES = {
  '/forget-password': { window: 3600, max: 3 },
  '/request-password-reset': { window: 3600, max: 3 }, // ← GAP-05, a que faltava
  '/send-verification-email': { window: 3600, max: 3 },
  '/reset-password': { window: 3600, max: 5 },
  '/sign-in/email': { window: 60, max: 5 }, // ← GAP-06, a que faltava
  '/sign-up/email': { window: 3600, max: 10 },
  '/change-password': { window: 3600, max: 10 },
  '/sign-in/social': { window: 60, max: 10 },
} as const;
```

Por que `/request-password-reset` é obrigatório: `forgetPasswordPlugin` (`auth.config.ts:24-35`)
expõe `/forget-password` reaproveitando `requestPasswordReset.options`, mas **o core continua
servindo `/request-password-reset`**, e o casamento de regra é por caminho exato. Proteger só o
alias deixa 600 e-mails de reset por hora disponíveis pelo caminho nativo contra a caixa de
qualquer vítima — com o domínio de remetente do projeto.

As chaves são **relativas ao `basePath`**. `/forget-password`, nunca
`/api/auth/forget-password`. Escrita errada, a regra não casa e **falha em silêncio**: o limite
global de 10/min assume o lugar dela e nada acusa.

`enabled: isProduction` **não muda** (D-19).

### 5.6 `rate-limit.plugin.ts` — a correção crítica

```ts
export function buildRateLimitOptions(config: Env) {
  return {
    global: config.NODE_ENV === 'production', // ← era 'development' (GAP-01)
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: (req: FastifyRequest) => req.url.startsWith('/health'),
    keyGenerator: (req: FastifyRequest) => req.ip,
  };
}
```

O `keyGenerator` fica **provisoriamente** só com `req.ip`: o ramo `req.user?.id` de hoje é código
morto (o hook do rate limit roda antes do que popula `request.user`) e o cast `as unknown as`
esconde isso do type checker. Remover o ramo morto agora deixa o código honesto; a forma final,
com a dimensão de sessão, é de **F5-S07** (spec `08` §3.2, D-55).

**Não mude a ordem de registro do `buildApp()`.** Mover o limitador para depois do `authPlugin`
tira do teto a própria rota coringa `/api/auth/*`, que é registrada dentro dele.

### 5.7 `app.ts` — `trustProxy`, `genReqId` e o Swagger UI

```ts
const app = Fastify({
  trustProxy: env.TRUST_PROXY_HOPS,
  logger: {/* inalterado — spec 04 §5 */},
  genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
}).withTypeProvider<ZodTypeProvider>();
```

E, no passo 3 do factory, o registro do Swagger UI passa a ser condicional. **A geração do spec
continua incondicional** — é dela que `scripts/export-openapi.ts` depende (D-21, D-56). O que fica
condicional é só o `@fastify/swagger-ui`, dentro de `swagger.plugin.ts`:

```ts
if (shouldExposeSwaggerUi(env.NODE_ENV)) {
  await fastify.register(swaggerUi, { routePrefix: '/docs' /* ... */ });
}
```

Isso resolve dois problemas de uma vez: a superfície pública em produção e o fato de que a CSP
padrão do `helmet` (ativa em produção por `helmet.plugin.ts:8`) **bloqueia os scripts inline do
próprio Swagger UI** — hoje a interface está publicamente montada e provavelmente quebrada.

### 5.8 `ci.yml` — o literal com forma de segredo

`.github/workflows/ci.yml:23` tem
`BETTER_AUTH_SECRET: troque-por-um-segredo-de-no-minimo-32-caracteres`. É o placeholder do
`.env.example`, então **nada real vaza** — mas é um literal com forma de segredo em arquivo
versionado, o que a política do repositório proíbe e o que um scanner de segredos vai acusar
para sempre.

Preferência, nesta ordem:

1. **Gerar no passo** — autossuficiente, não exige configuração humana no GitHub:

   ```yaml
   - name: Generate ephemeral auth secret
     run: echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> "$GITHUB_ENV"
   ```

   O passo entra **antes** de `Install dependencies`, e a linha some do bloco `env:` do job.

2. `${{ secrets.CI_BETTER_AUTH_SECRET }}` — só se a opção 1 não funcionar. Exige que o dono
   crie o secret; **avise antes de escolher esta**, porque quebra o CI de quem não o tiver.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/plugins/rate-limit.plugin.test.ts`

| #   | Caso                                                               | Esperado                       |
| --- | ------------------------------------------------------------------ | ------------------------------ |
| T1  | `buildRateLimitOptions({ NODE_ENV: 'production', ... })`           | `global === true` — **GAP-01** |
| T2  | `buildRateLimitOptions({ NODE_ENV: 'development', ... })`          | `global === false`             |
| T3  | `buildRateLimitOptions({ NODE_ENV: 'test', ... })`                 | `global === false`             |
| T4  | `allowList` com `/health` e `/health/ready`                        | `true` em ambos                |
| T5  | `allowList` com `/api/v1/tracks`                                   | `false`                        |
| T6  | `max` e `timeWindow` vêm de `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | refletem o `config` recebido   |

### Unit — `tests/unit/shared/utils/request-id.test.ts`

| #   | Caso                                  | Esperado            |
| --- | ------------------------------------- | ------------------- |
| T7  | `'req-abc_123.4'`                     | devolvido igual     |
| T8  | string de 200 caracteres válidos      | truncada em **64**  |
| T9  | `'req abc\nSet-Cookie: x'`            | ignorada; id gerado |
| T10 | `undefined`, `''`, `123`, `['a','b']` | id gerado em todos  |
| T11 | Dois ids gerados seguidos             | diferentes entre si |

### Unit — `tests/unit/shared/utils/client-ip.test.ts`

| #   | Caso                                                                      | Esperado                            |
| --- | ------------------------------------------------------------------------- | ----------------------------------- |
| T12 | `trustedProxies` vazio, XFF presente                                      | `socketIp`                          |
| T13 | XFF ausente                                                               | `socketIp`                          |
| T14 | `XFF: '203.0.113.9, 10.0.0.5'`, socket `10.0.0.5`, confiável `10.0.0.0/8` | `203.0.113.9`                       |
| T15 | `XFF: '203.0.113.9'`, socket `198.51.100.7`, confiável `10.0.0.0/8`       | `198.51.100.7` — **forja ignorada** |
| T16 | Dois saltos confiáveis: `'203.0.113.9, 10.0.0.5, 10.0.0.6'`               | `203.0.113.9`                       |
| T17 | Todos os saltos confiáveis: `'10.0.0.4, 10.0.0.5'`, socket `10.0.0.5`     | `socketIp`                          |
| T18 | IPv6 em CIDR IPv6 confiável                                               | resolve sem lançar                  |

### Unit — `tests/unit/config/env.test.ts` (casos novos)

| #   | Caso                                              | Esperado                         |
| --- | ------------------------------------------------- | -------------------------------- |
| T19 | `production` sem `TRUST_PROXY_HOPS` (ou `0`)      | `ZodError` citando a var         |
| T20 | `production` com `TRUSTED_PROXIES` vazio          | `ZodError` citando a var         |
| T21 | `production` com as duas preenchidas              | parseia                          |
| T22 | `development` sem nenhuma das duas                | parseia; `0` e `[]`              |
| T23 | `TRUSTED_PROXIES=' 10.0.0.0/8 , ,172.16.0.0/12 '` | `['10.0.0.0/8','172.16.0.0/12']` |

### Unit — `tests/unit/plugins/swagger.plugin.test.ts`

| #   | Caso                                   | Esperado |
| --- | -------------------------------------- | -------- |
| T24 | `shouldExposeSwaggerUi('production')`  | `false`  |
| T25 | `shouldExposeSwaggerUi('development')` | `true`   |
| T26 | `shouldExposeSwaggerUi('test')`        | `true`   |

### Integração — `tests/integration/auth-rate-limit.test.ts`

| #   | Caso                                                            | Esperado                        |
| --- | --------------------------------------------------------------- | ------------------------------- |
| T27 | `AUTH_RATE_LIMIT_RULES` contém as **8** chaves da §5.5          | todas presentes, nenhuma a mais |
| T28 | `'/forget-password'` e `'/request-password-reset'`              | regras **idênticas** — GAP-05   |
| T29 | Toda chave começa com `/` e **nenhuma** contém `/api/auth`      | relativas ao `basePath`         |
| T30 | 20 `POST /api/auth/sign-in/email` seguidos em ambiente de teste | nenhum 429 — D-19 preservado    |
| T31 | Fluxo sign-up → verify → sign-in continua verde                 | sem regressão da suíte de F3    |
| T32 | `GET /api/auth/get-session` com bearer válido                   | 200 — a ponte não foi afetada   |

> **Não existe teste que prove o 429 em produção.** `enabled`/`global` estão presos a
> `NODE_ENV=production` por D-19, e ligá-los em teste produz flake — é literalmente a causa que
> D-19 existe para evitar. É por isso que T1–T6 asseveram o **objeto de configuração**, e não o
> comportamento HTTP. A verificação de comportamento é manual, na §7, e depois em produção via
> T11/T12 de F5-S08. **Não invente um teste que force `NODE_ENV=production`** para "cobrir" isso:
> ele vai passar a derrubar a suíte inteira de forma intermitente.

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm openapi:export -- --check     # deve passar SEM regenerar (nada de contrato mudou)
```

**Verificação manual do rate limit**, com um `.env` temporário de produção — não commite:

```bash
NODE_ENV=production TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
  RESEND_API_KEY=re_fake_para_boot CORS_ORIGIN=http://localhost:3333 \
  node dist/server.js &

# 1. limitador global existe agora (GAP-01)
for i in $(seq 1 120); do curl -s -o /dev/null -w '%{http_code} ' localhost:3333/api/v1/tracks; done; echo
# esperado: 200 até ~100, depois 429

# 2. o caminho nativo do reset está protegido (GAP-05)
for i in $(seq 1 6); do curl -s -o /dev/null -w '%{http_code} ' -X POST \
  localhost:3333/api/auth/request-password-reset \
  -H 'content-type: application/json' -d '{"email":"a@b.com"}'; done; echo
# esperado: 200 200 200 429 429 429

# 3. XFF forjado não cria bucket novo (GAP-04)
for i in $(seq 1 10); do curl -s -o /dev/null -w '%{http_code} ' -X POST \
  -H "X-Forwarded-For: 203.0.113.$i" -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"x"}' localhost:3333/api/auth/sign-in/email; done; echo
# esperado: 429 a partir da 6ª — NÃO dez respostas 401

# 4. Swagger fora do ar em produção (GAP-17)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/docs      # 404
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/health    # 200
```

**Boot falha fechado** (D-50):

```bash
NODE_ENV=production RESEND_API_KEY=re_x node dist/server.js
# esperado: [Config Error] citando TRUST_PROXY_HOPS e TRUSTED_PROXIES, exit 1
```

- [ ] T1–T32 verdes
- [ ] Os 4 comandos manuais acima com a saída esperada
- [ ] Boot em produção sem as duas variáveis **derruba o processo** com mensagem clara
- [ ] `grep -n "NODE_ENV === 'development'" src/plugins/rate-limit.plugin.ts` **vazio**
- [ ] `grep -rn "as unknown as" src/plugins/rate-limit.plugin.ts` **vazio**
- [ ] `grep -n "troque-por-um-segredo" .github/workflows/ci.yml` **vazio**
- [ ] `grep -rn "trustProxy: true" src/` **vazio**
- [ ] `/docs` continua abrindo em `development`; `docs/openapi.json` **não mudou**
- [ ] Suíte de F3 e F4 continua verde, sem 429 espúrio
- [ ] PR verde; memória atualizada

**CI vermelho:** protocolo da spec `06` §5 — até 3 tentativas, depois **para e reporta**.

---

## 8. Armadilhas conhecidas

1. **Corrigir o `global` sem o `trustProxy` é trocar um problema por outro.** Atrás da Railway,
   `req.ip` é o IP do balanceador para **todos** os clientes: o primeiro usuário ativo consome os
   100/min e todo mundo recebe 429. GAP-01 e GAP-10 entram no **mesmo** commit, sempre.
2. **`trustProxy: true` reabre o GAP-04.** O Fastify passa a confiar na cadeia inteira e o cliente
   volta a forjar o IP. É `TRUST_PROXY_HOPS`, um número. D-50 é explícita.
3. **`customRules` com o caminho absoluto não casa e não avisa.** `/api/auth/forget-password`
   simplesmente nunca bate; o limite global assume e você acha que protegeu. Toda chave é relativa
   ao `basePath` — o T29 existe só para isso.
4. **Proteger o alias e esquecer o nativo.** `/forget-password` é o alias local;
   `/request-password-reset` é o do core, e continua servido. As duas entradas, valores idênticos.
5. **Ligar `enabled` ou `global` em teste para "conseguir testar o 429".** Isso derruba a suíte de
   forma intermitente e é exatamente o que D-19 proíbe. Teste o objeto de configuração (T1–T6).
6. **Ler o `X-Forwarded-For` da esquerda para a direita.** A esquerda é a parte que o cliente
   escreve. A varredura é da direita para a esquerda, parando no primeiro salto não confiável —
   T15 é o caso que pega isso.
7. **Desligar o `@fastify/swagger` junto com o `swagger-ui`.** Só a **UI** é condicional. Sem a
   geração do spec, `pnpm openapi:export` quebra e o `--check` do CI derruba o PR (D-21, D-56).
8. **Regenerar o `openapi.json` "para o check passar".** Nada de contrato muda neste sprint. Se o
   `--check` acusar diferença, você mexeu em algo fora do escopo — investigue, não regenere.
9. **Acrescentar dependência para comparar CIDR.** `node:net` tem `BlockList`, é nativo e cobre
   IPv4 e IPv6. Dependência nova exige ADR, e este sprint não tem nenhuma.
10. **Inventar a assinatura de `advanced.ipAddress`.** A §5.1 existe para confirmá-la no pacote
    instalado. Se divergir, **pare e reporte** — há um fallback autorizado e apenas um.
11. **Mover o `rateLimitPlugin` para depois do `authPlugin`** para "consertar o `keyGenerator`".
    Isso tira do teto a rota coringa `/api/auth/*`, registrada dentro do `authPlugin`. A forma
    final da chave é de F5-S07; aqui o ramo morto só é removido.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** D-19, D-49, D-50 e D-56 já cobrem este sprint.
  Se você precisou decidir algo que elas não cobrem, isso é sinal de que o sprint tem um buraco:
  **pare e reporte** em vez de registrar `D-NN` novo.
- **`PROGRESS.md`** — F5-S02 ✅, próximo = F5-S03. Acrescente às pendências, se a §0 se aplicar:
  _"CIDRs reais da borda da Railway a preencher em F5-S08 (`TRUSTED_PROXIES`)"_.
- **`F5-S02.md`** — o que a §5.1 encontrou no pacote instalado (assinatura real de
  `advanced.ipAddress`, com o caminho do arquivo e a linha), a saída dos 4 comandos manuais da §7,
  e **por que o `keyGenerator` ficou só com `req.ip`** — a próxima sessão precisa saber que isso é
  intencional e que F5-S07 completa, senão vai "corrigir" de volta.

---

## 10. Depois deste sprint

O rate limiting existe e é honesto, mas ainda é **local ao processo**: com `k` réplicas o limite
efetivo é `k × max` (GAP-12). Até F5-S07 entregar o armazenamento compartilhado, **produção roda
com réplica única** — e F5-S08 registra isso no runbook de deploy.

Próximo: **F5-S03**, higiene de recuperação de conta — e é o sprint que muda contrato de rota
(`sign-in` passa a responder 403 antes da verificação de e-mail).
