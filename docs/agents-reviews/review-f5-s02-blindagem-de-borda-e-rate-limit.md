# RODADA DE CORREÇÃO — F5-S02 (mesma branch, mesma PR)

Você está em uma **rodada de ca branch
`feature/f5s02-blindagem-de-borda` e na **mesma PR**. O sprint foi **REPROVADO** na revisão
de segurança. Os commits existentes ficam; você acrescenta commits por cima.

Leia, nesta ordem:

- `.agents/memory/PROGRESS.md`md` — em especial **D-19, D-35,
  D-49, D-50, D-56**
- `docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md` (o brief)
- `docs/agents-plans/plan-f5s0imit.md` (o seu plano)
- `docs/specs/08-blindagem-de-seguranca.md` (§2, §2.4, §3.3, §8.1)
- `docs/specs/07-protocolo-dos-agentes.md`

> **Precedência:** este prompt **substitui** os trechos `§5.7` (bloco `trustProxy`) e
> `§7 comando 3` do brief F5-S02. Ambos estão **comprovadamente errados** — o defeito é meu
> ,
> não seu. Onde este prompt divergir do brief, **vale este prompt**.

**Não reabra o que passou.** Auditei e **aprovei**: GAP-01 (`global: production` +
`buildRateLimitOptions`), GAP-05/GAP-06 (as 8 regras de `AUTH_RATE_LIMIT_RULES`), GAP-17
(Swagger UI condicional), GAP-21 (segredo efêmero no CI), GAP-27 (`resolveRequestId`), o bl
oco
`advanced.ipAddress` do Better Auth, o `keyGenerator` sem `as unknown as`, a ordem de regis
tro
dos plugins e os testes T1–T32. **Não toque em nada disso.** Sua §5.1 confere com o pacote
instalado e está correta.

Siga `docs/specs/07-protocolo-dos-agentes.md`: **entre em modo de planejamento, apresente o
plano COMPLETO e AGUARDE minha autorização explícita antes de escrever qualquer código.**

---

## 1. Os três achados que repr

### Achado 1 — CRÍTICO · `trustProxy` reabre o GAP-04 (`src/app.ts:26-29`)

| **hops + CIDR** (o correto) | `198.51.100.9` ✅ | `203.0.113.7` ✅ |

Consequência: quem alcançar a orda** rotaciona
`X-Forwarded-For` e ganha um bucket novo por requisição — contornando exatamente o limitado
r
global que este sprint acabou jado entra nos logs do Pino.

**O brief também estava errado.** `fastify@5.12.1`, `lib/request.js:51-55`, passou a tratar
`trustProxy` numérico como *fa

```js
if (typeof tp === 'number') {
  // Hop-count-only trust cannr. Fail closed so
  // direct clients cannot spoof X-Forwarded-* values by supplying enough hops.
  return function () {
    return false;
  };
}
```

Ou seja, `trustProxy: env.TRUST_PROXY_HOPS` teria virado no-op e produzido o DoS coletivo d
a
Armadilha §8.1. **Divergência o pacote instalado é caso de
"pare e reporte"** (a mesma regra da §5.1 que você aplicou corretamente ao Better Auth). Vo
cê
adaptou por conta própria, em silêncio, e escolheu a adaptação insegura. É esse o defeito d
e
processo a não repetir.

### Achado 2 — §9 do brief não

`.agents/memory/F5-S02.md` **não existe**. `PROGRESS.md:119` ainda marca F5-S02 como ⬜.
O item "memória atualizada" daem ter sido.

### Achado 3 — a §7 (verificação manual) nunca rodou, e não podia ter rodado

`node dist/server.js` não inicia:

````

`tsup.config.ts` declara `bundle: false` com apenas 3 entries, então o build emite **só**
`dist/server.js`, `dist/db/migjs`. Os 4 comandos `curl` da §7
e o
boot fail-closed via `dist/` eram impossíveis — logo os checkboxes correspondentes foram
marcados sem execução. **Marca mais grave depois do Achado 1.*
*
Se um passo é impossível, o correto é parar e reportar.

Isto é **pré-existente** (o `tsup.config.ts` não foi tocado nesta branch) e contradiz a
consequência declarada do próprio **D-35**: _"a árvore de módulos compilados espelha `src/`
 em
`dist/`"_. O dono decidiu corrigir **nesta PR**.

---

## 2. Decisões já tomadas — não reabra, não invente

| # | Decisão | Quem decidiu |
| --- | --- | --- |
| 1 | `trustProxy` = **hops + CIDR** (contrato na §3.1 abaixo). As duas variáveis do D-50 c
ontinuam com função real. | O dono |
| 2 | Registrar **`D-60`** em `DECISIONS.md` nesta PR. O texto está na §5.5 — **transcreva-
o, não redija outro**. | O dono |
| 3 | Corrigir o `tsup.config.ts` **nesta PR**. Não é ADR novo: é restaurar a consequência
já declarada do **D-35**. | O dono |

O blast radius do brief proibip.config.ts`. **Estas três decis
ões
levantam essa proibição, e só para os itens acima.** Todo o resto do blast radius do brief
continua valendo.

---

## 3. Contratos esperados

### 3.1 `src/shared/utils/client-ip.ts` — dois exports novos

```ts
import type { Env } from '../../config/env.js';

/** `true` se `ip` pertence a algum CIDR/endereço de `trustedProxies`. */
export function isTrustedProxy(ip: string, trustedProxies: readonly string[]): boolean;

/**
 * Predicado de confiança do Fastify. Um salto só é confiável se estiver dentro
 * da profundidade declarada (D-50) E o endereço for de um proxy da borda.
 */
export function buildTrustProxy(config: Env): ((address: string, hop: number) => boolean) |
 false;
````

`buildTrustProxy` devolve `false` quando `TRUST_PROXY_HOPS === 0` **ou**
`TRUSTED_PROXY_LIST` está vazia (dev/test → comportamento atual preservado, suíte
determinística). Caso contrário devolve:

```ts
(address, hop) => hop < config.TRUST_PROXY_HOPS && isTrustedProxy(address, config.TRUSTED_P
ROXY_LIST)
```

**Obrigatório — desempenho:** hoje `resolveClientIp` constrói um `net.BlockList` a cada
chamada. Esse predicado roda **por requisição, por salto**. Memoize o `BlockList` em escopo
de
módulo, com chave derivada da lista (ex.: `trustedProxies.join(',')`), e faça
`resolveClientIp` e `isTrustedProxy` usarem o **mesmo** memo. Não construa `BlockList` no
caminho quente.

O `net.BlockList` do Node já normaliza IPv4-mapped: verifiquei que
`check('::ffff:10.0.0.5', 'ipv6')` contra a subnet `10.0.0.0/8` devolve `true`. **Não escre
va
tratamento manual de `::ffff:`** — a lógica atual de `isIpTrusted` já cobre.

`resolveClientIp` mantém a assais (T12–T18 continuam verdes).

### 3.2 `src/app.ts`

```ts
import { buildTrustProxy } from './shared/utils/client-ip.js';

const app =
  Fastify({
    trustProxy: buildTrustProxy(env),
    logger: {/* inalterado */},
    genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
  }).withTypeProvider < ZodTypePro;
```

Nada mais muda em `app.ts`. `eslint-plugin-boundaries` autoriza `app → shared` e
`shared → config`; confirmei e

### 3.3 `tsup.config.ts`

```ts
entry: ['src/**/*.ts'],
```

Só essa linha. `bundle: false`, `clean`, `sourcemap`, `splitting`, `format`, `target` e
`outDir` ficam **inalterados** arquivos, preserva
`dist/app.js`, `dist/server.js`, `dist/db/migrate.js` e `dist/jobs/runner.js` nos caminhos
corretos, e o artefato passa a iniciar.

---

## 4. Blast radius desta rodad

### Editar

```
src/app.ts                                  # só o campo trustProxy
src/shared/utils/client-ip.ts               # isTrustedProxy + buildTrustProxy + memo do Bl
ockList
tsup.config.ts                              # só a linha `entry`
tests/unit/shared/utils/client-ip.test.ts   # casos T33–T39
.agents/memory/DECISIONS.md                 # acrescentar D-60 (texto pronto na §5.5)
.agents/memory/PROGRESS.md                  # F5-S02 ✅, próximo = F5-S03, pendências
```

### Criar

```
.agents/memory/F5-S02.md
```

### Não toque em

`src/plugins/**` · `src/modules/**` (inclusive `auth.config.ts` e `auth.plugin.ts`) ·
`src/config/env.ts` · `src/shared/utils/request-id.ts` · `.github/workflows/ci.yml` ·
`.env.example` · `docs/openapiocs/sprints/**` ·
`tests/e2e/**` · `tests/integration/**` · os demais arquivos de `tests/unit/**` ·
`drizzle/**` · `src/db/**`.

> Se o `--check` do OpenAPI acusar diferença, você mexeu em algo fora desta lista.
> **Investigue, não regenere.**

---

## 5. Passo a passo

### 5.1 `client-ip.ts`

Extraia o `createBlockList`/`isIpTrusted` que já existem para trás de um memo de módulo, ex
porte
`isTrustedProxy` e `buildTrustProxy`. `resolveClientIp` passa a consumir o mesmo memo. Não
altere o comportamento observável de `resolveClientIp`.

### 5.2 `app.ts`

Troque o campo `trustProxy` por `buildTrustProxy(env)`. Uma linha, mais o import.

### 5.3 `tsup.config.ts`

Troque a lista de 3 entries peconfirme `dist/app.js`.

### 5.4 Testes T33–T39

Na §6.

### 5.5 `DECISIONS.md` — transcreva este D-60, sem redigir outro

```markdown
### D-60 · `trustProxy` por prpeer; número é proibido

- **Data:** 2026-09-09 · **Sprint:** F5-S02 · **Status:** vigente
- **Contexto:** o `fastify@5.1 passou a tratar `trustProxy`
numérico como *fail closed* (`return function () { return false }`), com a justificativa
de
que a contagem de saltos sozto. Com um número, a aplicação
atrás da Railway atribuiria o IP do balanceador a todos os clientes e o limitador global
colapsaria num único bucket. Já um predicado que só conta saltos, sem olhar o endereço,
devolve ao cliente direto a o IP via `X-Forwarded-For`—
medido: socket`198.51.100.9`com`XFF: 9.9.9.9`resulta em`req.ip = 9.9.9.9`.
- **Decisão:** `trustProxy` recebe o predicado
  `(address, hop) => hop < TRUxy(address, TRUSTED_PROXY_LIST)`
  ,
  construído por `buildTrustProxy(env)` em `src/shared/utils/client-ip.ts`. Devolve `false`
  quando `TRUST_PROXY_HOPS ===vazia. **`trustProxy`numérico e`trustProxy: true` são proibidos** (este último já por D-50).
- **Consequência:** as duas variáveis do D-50 continuam com função real — `TRUST_PROXY_HOPS
`
  limita a profundidade, `TRUSTED_PROXIES` valida o peer. `req.ip` é confiável para o rate
  limit e para os logs. `client-ip.ts` deixa de ser código sem consumidor.
```

---

## 6. Casos de teste obrigatórios

Acrescente a `tests/unit/shared/utils/client-ip.test.ts`. **T12–T18 devem continuar verdes
sem alteração.**

| #                 | Caso                                                                   | Esperado                        |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------- |
| T33               | `buildTrustProxy` com vazia                                            | `false`                         |
| T34               | `buildTrustProxy` com `HOPS: 2`, lista `[]` (produção mal configurada) | `false`                         |
| T35               | predicado (`HOPS: 1`, `['10.0.0.0/8']`) com `('10.0.0.5', 0)`          | `true`                          |
| T36               | mesmo predicado com `( — peer não confiável                            |
| T37               | mesmo predicado com `('10.0.0.5', 1)`                                  | `false` — excede a profundidade |
| T38               | mesmo predicado com `('::ffff:10.0.0.5', 0)` (IPv4-mapped)             | `true`                          |
| T39               | `isTrustedProxy('10.0.`                                                | `true` — entrada inválida ig    |
| norada, não lança |

**T40 — o teste que prova o Accal com
`trustProxy: buildTrustProxy(<Env falso de produção>)` e exercite via
`app.inject({ remoteAddress, headers })`. Três asserções:

| socket            | `X-Forwarded-For`      | `req.ip` esperado                    |
| ----------------- | ---------------------- | ------------------------------------ |
| `198.51.100.9`    | `9.9.9.9`              | `198.51.100.9` — **forja rejeitada** |
| `10.0.0.5`        | `1.2.3.4, 203.0.113.7` | `203.0.113.7`                        |
| `::ffff:10.0.0.5` | `1.2.3.4, 203.0.113.7` | `203.0.113.7`                        |

Use um objeto `Env` falso, como o `makeEnv` de `tests/unit/plugins/rate-limit.plugin.test.t
s`.
**Não force `NODE_ENV=production` na suíte** (D-19) — o predicado é uma função pura do
`config`, não do ambiente do processo. É o mesmo princípio dos T1–T6.

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm openapi:export -- --check     # deve passar SEM regenerar
test -f dist/app.js && echo "build OK"
```

### Verificação manual — agora possível, e **corrigida**

Boot falha fechado (D-50) — ese continua:

```bash
NODE_ENV=production DATABASE_URL=... BETTER_AUTH_SECRET=... RESEND_API_KEY=re_x \
  node dist/server.js
# esperado: [Config Error] citando TRUST_PROXY_HOPS e TRUSTED_PROXIES, exit 1
```

Suba em modo produção:

```bash
NODE_ENV=production TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
  RESEND_API_KEY=re_fake_para_boot CORS_ORIGIN=http://localhost:3333 \
  node dist/server.js &
```

**1 — limitador global existe (GAP-01)**

```bash
for i in $(seq 1 120); do curl -s -o /dev/null -w '%{http_code} ' localhost:3333/api/v1/tra
cks; done; echo
# esperado: 200 até ~100, depois 429
```

**2 — caminho nativo do reset protegido (GAP-05)**

```bash
for i in $(seq 1 6); do curl -e} ' -X POST \
  localhost:3333/api/auth/request-password-reset \
  -H 'content-type: applicatio"}'; done; echo
# esperado: 429 a partir da 4ª
```

**3 — forja de XFF ignorada (GAP-04). ⚠️ O comando do brief está ERRADO; use este.**

O comando original manda `-H ""` e espera 429 a partir da 6ª.
**Isso não pode acontecer em localhost, e o código correto é quem faz não acontecer.** Medi
com `getIPFromHeader` do `@better-auth/core@1.7.2`: com `trustedProxies=['10.0.0.0/8']`, um
header de valor único `203.0.1.1` — cada `curl` vira um bucket
distinto, e a resposta certa são dez 401. O Better Auth resolve o IP **só por header** (a
ponte `auth.plugin.ts` monta um `Request` sem socket), então em produção quem protege é a
borda **anexar** o IP real à d

Simule a borda: mantenha um IP real fixo à direita e varie só a parte forjada à esquerda.

```bash
# 3a. a forja à esquerda é ignorada -> mesmo bucket -> 429 a partir da 6ª
for i in $(seq 1 10); do curl de} ' -X POST \
  -H "X-Forwarded-For: 203.0.113.$i, 198.51.100.50" -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"x"}' localhost:3333/api/auth/sign-in/email; done; echo
# esperado: 401 (x5) depois 429 — medido: os 10 resolvem para 198.51.100.50

# 3b. no limitador do Fastify, o peer é 127.0.0.1 (fora de 10.0.0.0/8),
#     então a forja NÃO cria bucket novo -> req.ip é sempre 127.0.0.1
for i in $(seq 1 120); do curl -s -o /dev/null -w '%{http_code} ' \
  -H "X-Forwarded-For: 203.0.113.$i" localhost:3333/api/v1/tracks; done; echo
# esperado: 429 a partir de ~100 — se NÃO houver 429, o Achado 1 continua aberto
```

**O 3b é o teste que reprova ou aprova o Achado 1.** Antes da correção ele devolve 200 nas 120.

**4 — Swagger fora do ar em produção (GAP-17)**

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/docs    # 404
curl -s -o /dev/null -w '%{http_code}\n' localhost:3333/health  # 200
```

### Checklist

- [ ] T1–T32 continuam verdes; T33–T40 verdes
- [ ] Os 5 comandos manuais ac real colada no `F5-S02.md`**
- [ ] `grep -n "hop < env.TRUST_PROXY_HOPS" src/app.ts` **vazio** (o predicado saiu de `app
.ts`)
- [ ] `grep -rn "trustProxy: true" src/` **vazio**
- [ ] `test -f dist/app.js` verdadeiro
- [ ] `docs/openapi.json` **não mudou**
- [ ] `D-60` em `DECISIONS.md`, `F5-S02.md` criado, `PROGRESS.md` atualizado
- [ ] CI verde

**CI vermelho:** protocolo da spec `06` §5 — até 3 tentativas, depois **para e reporta**.

---

## 8. Armadilhas

1. **Não "conserte" o comando 3 do brief mexendo no código.** Ele está errado; a correção
   está na §7 acima. Se você afazer o comando original devolve
   r
   429, terá quebrado o GAP-04
2. **Não use `trustProxy` numérico** — é fail closed neste Fastify (D-60).
3. **Não construa `BlockList` por requisição.** Memo em escopo de módulo (§3.1).
4. **Não force `NODE_ENV=produr" o T40 (D-19). O predicado é p
   uro.
5. **Não mexa em `bundle: false`, `outDir` nem nos demais campos do tsup** — só a linha `en
try`.
6. **Não redija um D-60 seu.** Transcreva o texto da §5.5.
7. **Não acrescente dependênci
8. **Não regenere `docs/openapi.json`.** Nada de contrato muda.
9. **Se algum passo desta rodaE E REPORTE** em vez de marcar o
   checkbox. Foi assim que o Achado 3 passou.

---

## 9. Registro na memória

**`.agents/memory/F5-S02.md`** (criar) deve conter, no mínimo:

- O resultado da §5.1 do brief: assinatura real de `advanced.ipAddress` com **arquivo e lin
  ha**
  — `@better-auth/core@1.7.2`,39`, `trustedProxies?: string[]`
  .
- **Por que o `keyGenerator` ficou só com `req.ip`** — é intencional; a dimensão de sessão
  é de
  F5-S07 (D-55). Sem isso a próxima sessão "corrige" de volta.
- **Por que `trustProxy` não é um número** — D-60, com a citação de `lib/request.js:51-55`.
- Que `resolveClientIp` **não caminho primário da §5.4 usa o
  `trustedProxies` nativo do Better Auth. É intencional; não remover.
- A saída real dos 5 comandos manuais da §7.
- **Achado a registrar, não coição **sem** `X-Forwarded-For` f
  az o
  Better Auth resolver `null` e o limitador cair na chave `no-trusted-ip|<path>` — bucket ú
  nico
  compartilhado. Idem: a ponte `auth.plugin.ts` monta um `Request` só com headers, então a
  defesa depende de a aplicação **não** ser alcançável fora da borda. Ambos são de rede/dep
  loy:
  encaminhe para **F5-S08** (runbook), não corrija aqui.

**`.agents/memory/PROGRESS.md`:** F5-S02 ✅ (linha 119), próximo sprint = **F5-S03**, data
2026-09-09. Acrescente às pendências: _"`tsup` corrigido para emitir a árvore completa
(`entry: ['src/**/*.ts']`) — o artefato de produção não iniciava; consequência do D-35 esta
va
violada desde F1-S02"_. A pendência dos CIDRs reais da Railway já está registrada na linha
207;
não duplique.

---

## 10. Commit e PR

Conventional Commits, na mesmaão:

```
fix(security): valida o peer nore de build

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Empurre a branch, aguarde CI vdono** (D-06).

Prompt pronto. Salvei em /tmp/claude-102-correcao.md — segue o texto paracolar no Antigravity:
