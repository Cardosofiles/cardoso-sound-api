# Plano de Implementação — Sprint F5-S02: Blindagem de Borda e Rate Limiting (Rodada de Correção)

> **Status:** 🟢 Implementação e Validação Concluídas (Etapa 5 Concluída · Pronto para Entrega)  
> **Fase:** F5 — Produção · **1º dos 6 sprints de blindagem** ([D-49](file:///.agents/memory/DECISIONS.md#d-49))  
> **Branch Alvo:** `feature/f5s02-blindagem-de-borda` (mesma branch, mesma PR)  
> **Depende de:** F5-S01 (OpenAPI versionado e verificado)  
> **Entrega:** GAP-01, GAP-04, GAP-05, GAP-06, GAP-10, GAP-17, GAP-21, GAP-27, D-60  
> **Specs de Referência:**
>
> - [`TASK.md`](file:///TASK.md) (Diretriz normativa desta rodada de correção)
> - [`docs/specs/08-blindagem-de-seguranca.md`](file:///docs/specs/08-blindagem-de-seguranca.md) (§2, §2.4, §3.3, §8.1)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///docs/specs/04-autenticacao-e-seguranca.md) (§4, §6)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md`](file:///docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md)
> - [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md) (**D-19**, **D-35**, **D-49**, **D-50**, **D-56**, **D-60**)

---

## 1. Diagnóstico e Itens Aprovados vs. Reprovados

### 1.1 Itens Auditados e Aprovados (Inalteráveis nesta Rodada)

Os seguintes componentes foram auditados e formalmente aprovados pela engenharia de segurança, devendo permanecer **intocados**:

- **GAP-01:** `global: config.NODE_ENV === 'production'` e `buildRateLimitOptions` em `src/plugins/rate-limit.plugin.ts`.
- **GAP-05 / GAP-06:** As 8 regras de `AUTH_RATE_LIMIT_RULES` em `src/modules/auth/auth.config.ts`.
- **GAP-17:** Função `shouldExposeSwaggerUi` e montagem condicional do Swagger UI em `src/plugins/swagger.plugin.ts`.
- **GAP-21:** Geração de segredo efêmero do Better Auth via `openssl` no `.github/workflows/ci.yml`.
- **GAP-27:** Função pura `resolveRequestId` em `src/shared/utils/request-id.ts`.
- **Better Auth `advanced.ipAddress`:** Configuração com `trustedProxies` e `ipAddressHeaders`.
- **`keyGenerator`:** `(req) => req.ip` em `rate-limit.plugin.ts` (dimensão de sessão postergada para F5-S07 / D-55).
- **Testes Existentes T1–T32:** Devem permanecer 100% verdes e intocados.

### 1.2 Os Três Achados que Reprovaram o Sprint

1. **Achado 1 (CRÍTICO · Reabertura do GAP-04 em `src/app.ts`):**
   - O predicado `(_address, hop) => hop < env.TRUST_PROXY_HOPS` ignorava quem é o peer imediato da conexão socket.
   - Requisições diretas de clientes forjavam `X-Forwarded-For` arbitrário e ganhavam um novo bucket a cada chamada, contornando o rate limit global.
   - Além disso, o brief previa `trustProxy` numérico, que no `fastify@5.12.1` opera como _fail closed_ silencioso (`lib/request.js:51-55`).
   - **Correção:** `trustProxy` deve validar **hops + CIDR** através da função `buildTrustProxy(env)` exportada por `src/shared/utils/client-ip.ts`.
2. **Achado 2 (Entrega da Seção §9 do Brief):**
   - `.agents/memory/F5-S02.md` não havia sido criado e `PROGRESS.md` não fora atualizado.
   - **Correção:** Criação completa de `.agents/memory/F5-S02.md` com logs reais dos comandos de produção e atualização do status em `.agents/memory/PROGRESS.md`.
3. **Achado 3 (Inviabilidade do Boot de Produção com `node dist/server.js`):**
   - `tsup.config.ts` possuía `entry: ['src/server.ts', 'src/db/migrate.ts', 'src/jobs/runner.ts']` com `bundle: false`, não emitindo os demais arquivos em `dist/` (como `dist/app.js`), inviabilizando `node dist/server.js` e a execução fiel dos comandos curl manuais da §7.
   - **Correção:** Alterar `entry` em `tsup.config.ts` para `['src/**/*.ts']` (restaurando D-35 sem alterar nenhuma outra chave de empacotamento).

---

## 2. Decisões Normativas Aplicáveis

- **D-50:** Topologia de proxy declarada e blindagem contra spoofing de XFF.
- **D-35:** Espelhamento completo da árvore de arquivos TypeScript em `dist/`.
- **D-60 (Nova):** `trustProxy` por profundidade E validação do peer; proibição de número e de `trustProxy: true`.
  Texto exato da §5.5 transcrito fielmente em `.agents/memory/DECISIONS.md`.

---

## 3. Blast Radius Desta Rodada de Correção

### Arquivos Permitidos para Edição

1. [`src/shared/utils/client-ip.ts`](file:///src/shared/utils/client-ip.ts) — Adicionar `isTrustedProxy`, `buildTrustProxy` e memo de módulo para `net.BlockList`.
2. [`src/app.ts`](file:///src/app.ts) — Substituir predicado inline por `trustProxy: buildTrustProxy(env)`.
3. [`tsup.config.ts`](file:///tsup.config.ts) — Substituir `entry` pela lista `['src/**/*.ts']`.
4. [`tests/unit/shared/utils/client-ip.test.ts`](file:///tests/unit/shared/utils/client-ip.test.ts) — Adicionar casos T33 a T40.
5. [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md) — Acrescentar registro D-60.
6. [`.agents/memory/PROGRESS.md`](file:///.agents/memory/PROGRESS.md) — Atualizar F5-S02 ✅ e registrar pendência de build.
7. [`docs/agents-plans/plan-f5s02-blindagem-de-borda-e-rate-limit.md`](file:///docs/agents-plans/plan-f5s02-blindagem-de-borda-e-rate-limit.md) — Este plano atualizado.

### Arquivo a ser Criado

1. [`.agents/memory/F5-S02.md`](file:///.agents/memory/F5-S02.md) — Registro completo do sprint.

### Arquivos com Modificação Estritamente Proibida

- `src/plugins/**`
- `src/modules/**` (inclusive `auth.config.ts` e `auth.plugin.ts`)
- `src/config/env.ts`
- `src/shared/utils/request-id.ts`
- `.github/workflows/ci.yml`
- `.env.example`
- `docs/openapi.json`
- `docs/sprints/**`
- `tests/e2e/**`
- `tests/integration/**`
- Os demais arquivos de `tests/unit/**`
- `drizzle/**`
- `src/db/**`

---

## 4. Detalhamento Técnico da Implementação

### 4.1 `src/shared/utils/client-ip.ts`

- **Memoização em Escopo de Módulo:**
  ```typescript
  const blockListCache = new Map<string, net.BlockList>();

  function getOrCreateBlockList(trustedProxies: readonly string[]): net.BlockList {
    const key = trustedProxies.join(',');
    let blockList = blockListCache.get(key);
    if (!blockList) {
      blockList = createBlockList(trustedProxies);
      blockListCache.set(key, blockList);
    }
    return blockList;
  }
  ```
- **Export `isTrustedProxy(ip: string, trustedProxies: readonly string[]): boolean`:**
  - Consulta o memo via `getOrCreateBlockList(trustedProxies)`.
  - Retorna `false` se `trustedProxies.length === 0`.
  - Executa `isIpTrusted(blockList, ip)` utilizando o suporte nativo do `net.BlockList` (que já lida com IPv4, IPv6 e IPv4-mapped `::ffff:`).
  - Ignora entradas inválidas sem lançar exceções.
- **Export `buildTrustProxy(config: Env): ((address: string, hop: number) => boolean) | false`:**
  - Se `config.TRUST_PROXY_HOPS === 0` ou `config.TRUSTED_PROXY_LIST.length === 0`, retorna `false`.
  - Caso contrário, retorna o predicado:
    ```typescript
    (address: string, hop: number) =>
      hop < config.TRUST_PROXY_HOPS && isTrustedProxy(address, config.TRUSTED_PROXY_LIST);
    ```
- **Preservação de `resolveClientIp`:**
  - Atualizado para consumir o mesmo `getOrCreateBlockList(trustedProxies)`, mantendo sua assinatura e comportamento originais (garantindo T12–T18 verdes).

### 4.2 `src/app.ts`

- Importar `buildTrustProxy` de `./shared/utils/client-ip.js`.
- Configurar `trustProxy`:
  ```typescript
  const app = Fastify({
    trustProxy: buildTrustProxy(env),
    logger: { ... },
    genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
  }).withTypeProvider<ZodTypeProvider>();
  ```
- Nenhuma outra linha de `src/app.ts` será alterada.

### 4.3 `tsup.config.ts`

- Substituir a linha `entry` por:
  ```typescript
  entry: ['src/**/*.ts'],
  ```
- Preservar `bundle: false`, `clean: true`, `sourcemap: true`, `splitting: false`, `format: ['esm']`, `target: 'node24'` e `outDir: 'dist'`.

---

## 5. Estratégia de Testes

### 5.1 Novos Testes Unitários (`tests/unit/shared/utils/client-ip.test.ts`)

Acrescentar os casos T33 a T40:

- **T33:** `buildTrustProxy` com `TRUST_PROXY_HOPS: 0`, lista vazia → `false`.
- **T34:** `buildTrustProxy` com `HOPS: 2`, lista `[]` → `false`.
- **T35:** Predicado (`HOPS: 1`, `['10.0.0.0/8']`) com `('10.0.0.5', 0)` → `true`.
- **T36:** Mesmo predicado com `('198.51.100.9', 0)` → `false` (peer não confiável).
- **T37:** Mesmo predicado com `('10.0.0.5', 1)` → `false` (excede profundidade).
- **T38:** Mesmo predicado com `('::ffff:10.0.0.5', 0)` → `true` (IPv4-mapped).
- **T39:** `isTrustedProxy('10.0.0.5', ['lixo', '10.0.0.0/8'])` → `true` (entrada inválida ignorada).
- **T40 (Prova do Achado 1):** Instância local do Fastify com `trustProxy: buildTrustProxy(<Env falso de prod>)` via `app.inject`:
  1. Socket `198.51.100.9` com `X-Forwarded-For: 9.9.9.9` → `req.ip = 198.51.100.9` (forja rejeitada).
  2. Socket `10.0.0.5` com `X-Forwarded-For: 1.2.3.4, 203.0.113.7` → `req.ip = 203.0.113.7`.
  3. Socket `::ffff:10.0.0.5` com `X-Forwarded-For: 1.2.3.4, 203.0.113.7` → `req.ip = 203.0.113.7`.

### 5.2 Validação Manual e Prova em Produção (§7 de `TASK.md`)

Executar contra o artefato compilado `dist/server.js`:

1. **Boot Fail-Closed:**
   `NODE_ENV=production DATABASE_URL=... node dist/server.js` deve abortar com `[Config Error]` citando `TRUST_PROXY_HOPS` e `TRUSTED_PROXIES`.
2. **Boot em Produção:**
   `NODE_ENV=production TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 RESEND_API_KEY=re_fake_para_boot CORS_ORIGIN=http://localhost:3333 node dist/server.js &`
3. **Comando 1 (Limitador global Fastify):**
   120 requisições seguidas para `/api/v1/tracks` → 200 até ~100, depois 429.
4. **Comando 2 (Rate limit Better Auth reset de senha):**
   6 POSTs em `/api/auth/request-password-reset` → 429 a partir da 4ª ou 5ª tentativa.
5. **Comando 3a (Forja à esquerda com peer confiável):**
   10 POSTs com `X-Forwarded-For: 203.0.113.$i, 198.51.100.50` para `/api/auth/sign-in/email` → 401 (x5) depois 429.
6. **Comando 3b (Forja sem passar por proxy confiável - Prova do Achado 1):**
   120 requisições com `X-Forwarded-For: 203.0.113.$i` a partir de `127.0.0.1` (fora de `10.0.0.0/8`) para `/api/v1/tracks` → 429 após 100 requisições (a forja NÃO cria buckets novos).
7. **Comando 4 (Swagger UI oculto em prod):**
   `curl localhost:3333/docs` → 404; `/health` → 200.
8. Colar todas as saídas reais no arquivo de memória `.agents/memory/F5-S02.md`.

---

## 6. Registro na Memória e Portões de Qualidade

1. **`DECISIONS.md`:** Acrescentar D-60 verbatim.
2. **`PROGRESS.md`:** Atualizar tabela de sprints com F5-S02 ✅ e adicionar a pendência de build do `tsup`.
3. **`F5-S02.md`:** Criar com as 6 seções obrigatórias especificadas na §9 de `TASK.md`.
4. **Pipeline Estático:**
   `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build && pnpm openapi:export -- --check`
   Confirmar `test -f dist/app.js`.
5. **Commitment:**
   `git commit` com mensagem aderente ao Commitlint:
   ```
   fix(plugins): valida o peer no trustproxy e restaura a arvore de build

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   ```
   (Nota: o escopo `plugins` foi selecionado em estrita observância ao `scope-enum` de `commitlint.config.mjs`, que não aceita `security`).

---

## 7. Próxima Ação (Parada Obrigatória)

⏸ **Parada 1 (Etapa 3 do Protocolo):** Aguardando a autorização explícita do usuário para iniciar a implementação dos passos acima.
