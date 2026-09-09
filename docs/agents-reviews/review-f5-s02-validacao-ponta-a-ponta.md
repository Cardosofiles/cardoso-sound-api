# Review de Segurança — F5-S02 · Validação Ponta a Ponta (pós-merge)

|                     |                                                                     |
| ------------------- | ------------------------------------------------------------------- |
| **Sprint**          | F5-S02 — Blindagem de Borda e Rate Limiting                         |
| **Branch auditada** | `feature/f5s02-blindagem-de-borda` → mergeada em `develop` (PR #29) |
| **Commit auditado** | `2c11cc0` (merge) · `4ab7241` (implementação)                       |
| **Revisor**         | Staff Security Engineer · Claude Opus 5                             |
| **Data**            | 2026-09-09                                                          |
| **Escopo**          | GAP-01, GAP-04, GAP-05, GAP-06, GAP-10, GAP-17, GAP-21, GAP-27      |
| **Rodada anterior** | `review-f5-s02-blindagem-de-borda-e-rate-limit.md` (3 achados)      |
| **Veredito**        | ✅ **APROVADO** — nenhuma correção bloqueante                       |

> Esta revisão **não é documental**. Todos os veredictos abaixo vêm de execução real contra o
> artefato compilado `dist/server.js` rodando com `NODE_ENV=production`, e de leitura do código
> dos pacotes instalados. Onde há tabela de saída, a saída foi medida nesta sessão, não copiada
> da memória do sprint.

---

## 1. Veredito por GAP

| GAP        | Alvo                                            | Status         | Como foi provado                                          |
| ---------- | ----------------------------------------------- | -------------- | --------------------------------------------------------- |
| **GAP-01** | Limitador global existir em produção            | ✅ **FECHADO** | 120 `GET /api/v1/tracks` → 100 × 200, 20 × 429            |
| **GAP-04** | Chave do limitador não vir de header do cliente | ✅ **FECHADO** | 120 reqs com XFF rotativo → mesmo bucket, 429 na 101ª     |
| **GAP-05** | Caminho nativo do reset protegido               | ✅ **FECHADO** | `/request-password-reset` → `200 200 200 429 429 429`     |
| **GAP-06** | Login por senha com regra própria               | ✅ **FECHADO** | `/sign-in/email` → `401 ×5` depois `429 ×5`               |
| **GAP-10** | Topologia de proxy declarada e validada         | ✅ **FECHADO** | Boot fail-closed + predicado hops + CIDR                  |
| **GAP-17** | Swagger UI fora do ar em produção               | ✅ **FECHADO** | `/docs` → 404 · `/docs/` → 404 · `/health` → 200          |
| **GAP-21** | Literal com forma de segredo no CI              | ✅ **FECHADO** | `grep troque-por-um-segredo .github/workflows/ci.yml` = 0 |
| **GAP-27** | `x-request-id` do cliente sanitizado e truncado | ✅ **FECHADO** | `resolveRequestId` + T7–T11 verdes                        |

**8 de 8 GAPs alvo entregues e comprovados.**

---

## 2. Os três achados da rodada anterior

### Achado 1 (CRÍTICO) — `trustProxy` reabria o GAP-04 · **RESOLVIDO**

`src/app.ts:26` agora usa `trustProxy: buildTrustProxy(env)`, e
`src/shared/utils/client-ip.ts:66-74` implementa o predicado normativo do D-60:

```ts
(address, hop) =>
  hop < config.TRUST_PROXY_HOPS && isTrustedProxy(address, config.TRUSTED_PROXY_LIST);
```

**Verificação independente da semântica do `hop`.** Confirmei em
`@fastify/proxy-addr@5.1.0/index.js:58-78` que `alladdrs` monta
`addrs = [socketPeer, ...XFF invertido]` e chama `trust(addrs[i], i)` — ou seja, `hop === 0` é o
**peer imediato do socket**, e o truncamento para no primeiro salto não confiável. O predicado está
correto: com `HOPS=1`, o peer precisa estar em `TRUSTED_PROXY_LIST` para que qualquer valor de XFF
seja considerado.

**Comando 3b — o teste decisivo, executado nesta sessão:**

```
$ for i in $(seq 1 120); do curl -s -o /dev/null -w '%{http_code} ' \
    -H "X-Forwarded-For: 203.0.113.$i" localhost:3333/api/v1/tracks; done

200 (×100) 429 (×20)
```

A forja rotativa **não criou bucket novo**. Antes da correção esta linha devolveria 120 × 200.
Achado 1 fechado com prova positiva.

Confirmei também, palavra por palavra, a citação de `fastify@5.12.1`, `lib/request.js:51-55` — o
ramo numérico é de fato _fail closed_ (`return function () { return false }`). O `trustProxy`
numérico do brief original teria produzido o DoS coletivo da Armadilha §8.1. **D-60 procede.**

### Achado 2 — §9 do brief não entregue · **RESOLVIDO**

- `.agents/memory/F5-S02.md` criado (173 linhas, 6 seções, saídas reais coladas).
- `.agents/memory/DECISIONS.md:706` — D-60 **transcrito fielmente** da §5.5 do prompt de correção;
  conferi parágrafo a parágrafo, sem redação própria.
- `.agents/memory/PROGRESS.md:119` — F5-S02 ✅ / PR #29 / 2026-09-09; próximo sprint F5-S03
  (linha 15); pendência do `tsup` registrada como resolvida (linha 213).

### Achado 3 — artefato de produção não iniciava · **RESOLVIDO**

`tsup.config.ts` passou a `entry: ['src/**/*.ts']`, com `bundle: false`, `clean`, `sourcemap`,
`splitting`, `format`, `target` e `outDir` **inalterados**. A árvore compilada volta a espelhar
`src/`, restaurando a consequência declarada do D-35:

```
$ pnpm build && find dist -name '*.js' -not -name '*.map' | wc -l
60
dist/app.js OK · dist/server.js OK · dist/db/migrate.js OK · dist/jobs/runner.js OK
```

**Boot fail-closed, medido:**

```
$ NODE_ENV=production DATABASE_URL=... BETTER_AUTH_SECRET=... RESEND_API_KEY=re_x node dist/server.js
[Config Error] Invalid environment variables:
  - TRUST_PROXY_HOPS: TRUST_PROXY_HOPS must be >= 1 in production (D-50)
  - TRUSTED_PROXIES: TRUSTED_PROXIES must list the edge CIDRs in production (D-50)
```

---

## 3. Verificação independente da §5.1 (assinatura do Better Auth)

Conferido no pacote instalado, não na documentação:

- `@better-auth/core@1.7.2` → `dist/types/init-options.d.mts:272` — `trustedProxies?: string[]`.
  **A assinatura confere.** A memória cita `src/types/init-options.ts:339` (linha do fonte via
  sourcemap); é a mesma declaração — divergência de citação, não de fato.
- `dist/utils/ip.mjs:171-197` — `getIPFromHeader` faz a varredura **da direita para a esquerda**,
  pulando saltos que casam com `trustedProxies` e devolvendo o primeiro não confiável; devolve
  `null` se todos forem confiáveis. É exatamente a semântica que o sprint assumiu.
- `dist/utils/ip.mjs:226` — chave `${ip}|${path}`, como documentado.

**Comando 3a, medido** (borda simulada anexando o IP real à direita):

```
$ XFF: "203.0.113.$i, 198.51.100.50" × 10 em /api/auth/sign-in/email
401 401 401 401 401 429 429 429 429 429
```

A forja à esquerda foi ignorada; os 10 resolveram para o mesmo bucket. **GAP-06 provado.**

---

## 4. Achados novos (não bloqueantes, fora do blast radius desta PR)

### R-01 · MÉDIA — o IP resolvido pelo Better Auth é escolhido pelo cliente

**Medido nesta sessão — bypass do limitador de autenticação:**

```
$ for i in $(seq 1 12); do curl -X POST \
    -H "X-Forwarded-For: 198.51.100.$i" \
    -d '{"email":"a@b.com","password":"xxxxxxxx"}' localhost:3333/api/auth/sign-in/email; done

401 401 401 401 401 401 401 401 401 401 401 401     ← nenhum 429
```

**Medido nesta sessão — e o efeito que persiste no banco:**

```
$ curl -X POST -H 'X-Forwarded-For: 6.6.6.6' localhost:3333/api/auth/sign-up/email \
    -d '{"email":"ip-forge-...@example.com","password":"senhaforte123","name":"Forge Test"}'
signup=200

$ select s.ip_address, u.email from session s join "user" u on u.id = s.user_id ...
 ip_address |              email
------------+---------------------------------
 6.6.6.6    | ip-forge-...@example.com
```

O peer real da conexão era `127.0.0.1` — fora de `10.0.0.0/8`, portanto não confiável. Ainda assim
`session.ip_address` (`src/db/schema/users.schema.ts:17`) gravou `6.6.6.6`. **O alcance de R-01 não
é só rate limit: é integridade de registro de auditoria de sessão**, que ao contrário de um bucket
de rate limit é persistente. _(Linha de teste removida do banco de desenvolvimento após a medição.)_

**Causa.** `src/modules/auth/auth.plugin.ts:44-48` monta um `Request` da Fetch API **só com
headers** — sem socket. O Better Auth, portanto, resolve o IP exclusivamente pelo header, e
`getIPFromHeader` confia incondicionalmente no salto mais à direita quando ele não pertence a
`trustedProxies`. Quem alcançar a aplicação **por fora da borda** escolhe a própria chave de rate
limit para todas as 8 regras de `AUTH_RATE_LIMIT_RULES` — e o próprio IP de auditoria.

**Contenção atual.** O limitador global do Fastify (`req.ip`, agora confiável) mantém o teto de
100/min sobre o peer real — o abuso fica limitado a isso, não é ilimitado. Em produção atrás da
Railway, com a borda anexando o IP real à direita, o comportamento é o correto (provado no 3a).

**A memória registra só metade disto.** `.agents/memory/F5-S02.md:161-167` documenta a variante
_sem_ `X-Forwarded-For` (bucket compartilhado `no-trusted-ip|<path>`), que também confirmei. A
variante por **rotação do salto à direita** — mais explorável, porque produz buckets distintos em
vez de um só — não está registrada.

**Correção recomendada (não aplicar nesta PR — `auth.plugin.ts` está fora do blast radius):** na
ponte, sobrescrever o `x-forwarded-for` entregue ao Better Auth pelo `request.ip` que o Fastify já
validou com o predicado do D-60, em vez de repassar o header do cliente:

```ts
// src/modules/auth/auth.plugin.ts — em toFetchHeaders, para a rota curinga
headers.set('x-forwarded-for', request.ip);
```

Com isso o limitador do Better Auth herda a mesma cadeia de confiança do limitador do Fastify e
deixa de depender da blindagem de rede. Ressalva a testar: se `request.ip` cair dentro de
`TRUSTED_PROXIES` (tráfego interno), a varredura devolve `null` e a requisição cai no bucket
`no-trusted-ip` — comportamento aceitável, mas precisa de caso de teste.

**Encaminhamento: F5-S04.** Registro que minha primeira recomendação nesta revisão foi **F5-S07**, e
estava **errada**. Conferi os dois briefs depois:

| Sprint     | Posição     | `src/modules/auth/auth.plugin.ts`                                              |
| ---------- | ----------- | ------------------------------------------------------------------------------ |
| **F5-S04** | 3º de 6     | **na lista `Editar`** (`F5-S04...md:171` — `shouldResolveSession + toRfc7807`) |
| **F5-S07** | 6º e último | **na lista `Não toque em`** (`F5-S07...md:165`)                                |

F5-S07 **proíbe explicitamente** tocar no arquivo onde a correção vive. Mandar R-01 para lá
produziria um brief que contradiz o próprio blast radius — o tipo de defeito que, por CLAUDE.md, é
meu e não do agente. Três razões pelo F5-S04:

1. **O arquivo já está aberto lá.** O sprint reescreve a ponte para o envelope RFC 7807 (GAP-26) e
   para `shouldResolveSession` (GAP-13). Um terceiro ajuste cirúrgico no mesmo arquivo, no mesmo
   PR, custa quase nada e não abre blast radius novo.
2. **O tema casa.** F5-S04 é "Endurecimento de **Sessão**, Schema e Contrato", e o impacto mais
   durável de R-01 é justamente `session.ip_address` falsificável.
3. **Chega 3 sprints antes.** F5-S07 depende de F5-S06; F5-S04 depende de F5-S03. Não há razão para
   carregar um achado medido por mais três sprints quando a correção cabe no próximo que abre o
   arquivo.

O que **fica** em F5-S08 é só a garantia de rede (ingresso exclusivo pela borda), como defesa em
profundidade — nunca como a única defesa.

### R-02 · BAIXA — `TRUST_PROXY_HOPS` real da Railway não está nas pendências

`PROGRESS.md:211` registra a pendência dos **CIDRs** (`TRUSTED_PROXIES`), mas não a do número de
saltos. As duas variáveis precisam casar com a topologia real:

- **Superestimar `HOPS` é seguro** — cada salto ainda é validado contra a lista de CIDRs, então um
  valor maior que o real não afrouxa nada. Este é um mérito real do desenho do D-60, e vale
  registrar.
- **Subestimar é que dói** — com `HOPS=1` e dois proxies reais à frente, `req.ip` vira o IP do
  segundo proxy para todos os clientes, e o limitador global colapsa num bucket só (a Armadilha
  §8.1 pela porta dos fundos).

**Encaminhamento:** acrescentar `TRUST_PROXY_HOPS` à pendência P3 do `PROGRESS.md`, junto dos
CIDRs, e ao checklist de F5-S08.

### R-03 · INFORMATIVO — `blockListCache` é um `Map` sem limite

`src/shared/utils/client-ip.ts:4` memoiza por `trustedProxies.join(',')`. Hoje é seguro: as chaves
vêm só de `env.TRUSTED_PROXY_LIST`, que é fixo no processo — no máximo uma entrada. Passa a ser
vetor de exaustão de memória se algum consumidor futuro chamar `isTrustedProxy` com lista derivada
de requisição. Vale um comentário no arquivo, não uma correção.

---

## 5. Portões de qualidade — executados nesta sessão

| Portão                        | Resultado                                                 |
| ----------------------------- | --------------------------------------------------------- |
| `pnpm typecheck`              | ✅ zero erros                                             |
| `pnpm lint`                   | ✅ zero violações (inclui `boundaries`)                   |
| `prettier --check`            | ✅ "All matched files use Prettier code style!"           |
| `pnpm vitest --project unit`  | ✅ 16 arquivos · **127 testes**                           |
| `... --project integration`   | ✅ 13 arquivos · **178 testes**                           |
| `... --project e2e`           | ✅ 5 arquivos · **11 testes**                             |
| `pnpm build`                  | ✅ 60 módulos em `dist/`, `dist/app.js` presente          |
| `pnpm openapi:export --check` | ✅ passou **sem regenerar** · `docs/openapi.json` intacto |

**Total: 316 testes verdes.** T1–T32 preservados; T33–T40 acrescentados. T40 exercita o predicado
via `app.inject()` com `remoteAddress`, incluindo o caso IPv4-mapped `::ffff:10.0.0.5` — confirmei
que o `net.BlockList` do Node normaliza o prefixo `::ffff:` sozinho, como o prompt de correção
afirmava, e que **não** há tratamento manual de `::ffff:` no código.

### Checklist do prompt de correção

- [x] T1–T32 verdes; T33–T40 verdes
- [x] Os 5 comandos manuais executados, com saída real (§2 e §3 acima)
- [x] `grep -n "hop < env.TRUST_PROXY_HOPS" src/app.ts` → vazio (predicado saiu de `app.ts`)
- [x] `grep -rn "trustProxy: true" src/` → vazio
- [x] `grep -n "NODE_ENV === 'development'" src/plugins/rate-limit.plugin.ts` → vazio
- [x] `grep -rn "as unknown as" src/plugins/rate-limit.plugin.ts` → vazio
- [x] `test -f dist/app.js` → verdadeiro
- [x] `docs/openapi.json` não mudou
- [x] D-60 em `DECISIONS.md`, `F5-S02.md` criado, `PROGRESS.md` atualizado
- [x] CI verde (PR #29 mergeada)

### Conformidade com o blast radius

Nenhum arquivo da lista "não toque" foi alterado. `src/plugins/**`, `src/modules/**`,
`src/config/env.ts`, `src/shared/utils/request-id.ts`, `.github/workflows/ci.yml`, `.env.example`,
`docs/openapi.json`, `tests/e2e/**`, `tests/integration/**`, `drizzle/**` e `src/db/**` estão
intocados pela rodada de correção — coerente com o `--check` do OpenAPI ter passado limpo.

---

## 6. Conclusão

**APROVADO.** Os 8 GAPs alvo estão fechados e cada um foi provado por execução, não por leitura. Os
três achados que reprovaram a rodada anterior estão corrigidos, e o crítico (Achado 1) tem prova
positiva e negativa: o comando 3b, que antes devolveria 120 × 200, agora devolve 429 a partir da
101ª.

Dois pontos de qualidade merecem registro. O primeiro é que o agente **não repetiu o defeito de
processo** que motivou a reprovação: a §5.1 foi executada contra o pacote instalado, e o resultado
está na memória com arquivo e linha. O segundo é que `D-60` foi transcrito, não redigido — o que
era exatamente o pedido.

O que fica em aberto é **R-01**, e não é defeito deste sprint: o brief proibiu explicitamente tocar
em `auth.plugin.ts` ("a ponte não muda — GAP-04 se resolve na config, não na ponte"). O agente
obedeceu, corretamente. Mas a consequência é que, para as rotas `/api/auth/*`, o fechamento do
GAP-04 depende de a aplicação ser inalcançável fora da borda — uma garantia de rede, não de código.
O limitador global do Fastify contém o dano, e em produção atrás da Railway o comportamento é
correto. Ainda assim, defesa em profundidade pede a correção na ponte.

### Ações recomendadas

Separadas por **quando a ação acontece**, que não é o mesmo que **quando o efeito é consumido** — a
tabela anterior desta revisão confundia as duas coisas na linha R-02.

**Agora (documental, sem tocar em código, um commit `docs:` em `develop`):**

| #       | Ação                                                                                                                                                                         | Autor |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **A-1** | Acrescentar a variante "rotação do salto à direita" + a prova de `session.ip_address` à §5 de `.agents/memory/F5-S02.md`                                                     | Eu    |
| **A-2** | Acrescentar `TRUST_PROXY_HOPS` à pendência **P3** do `PROGRESS.md` (hoje só cita `TRUSTED_PROXIES`), com a nota de que superestimar é seguro e subestimar colapsa os buckets | Eu    |
| **A-3** | Emendar o brief `F5-S04-sessao-schema-e-contrato.md`: R-01 vira item da §3.3 (`auth.plugin.ts` — de "duas mudanças cirúrgicas" para três), com caso de teste próprio         | Eu    |

**Em F5-S04 (código, pelo agente do Antigravity):**

| #       | Ação                                                                                                                      | Autoriza |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A-4** | Sobrescrever `x-forwarded-for` com `request.ip` na ponte, mais teste cobrindo peer não confiável → `req.ip` vence a forja | Dono     |

**Em F5-S08 (runbook de deploy):**

| #       | Ação                                                                                                       | Autoriza |
| ------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| **A-5** | Preencher `TRUSTED_PROXIES` **e** `TRUST_PROXY_HOPS` reais nas Railway Variables (consome A-2)             | Dono     |
| **A-6** | Registrar no runbook que o ingresso é exclusivo pela borda — defesa em profundidade, já não a única defesa | Dono     |

**Oportuno, sem sprint próprio:**

| #       | Ação                                                                                                     | Autor             |
| ------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| **A-7** | R-03 — comentar o limite implícito do `blockListCache` no próximo PR que abrir `client-ip.ts` (é F5-S07) | Agente, de carona |

> **Sobre "Dono decide".** A versão anterior desta tabela repetia isso em toda linha, o que não é
> recomendação — é omissão. Por CLAUDE.md a recomendação é minha e a autorização é sua. Acima, o que
> é decisão de engenharia já está decidido; o que precisa da sua palavra está marcado em **Autoriza**.

Nenhuma dessas ações bloqueia o avanço para **F5-S03**. A-1 a A-3 eu executo assim que você
autorizar; nenhuma toca em código.
