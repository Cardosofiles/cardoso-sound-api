# Plano de Implementação — Sprint F5-S02: Blindagem de Borda e Rate Limiting

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F5 — Produção · **1º dos 6 sprints de blindagem** ([D-49](file:///.agents/memory/DECISIONS.md#d-49))  
> **Branch Alvo:** `feature/f5s02-blindagem-de-borda` (a partir de `develop`)  
> **Depende de:** F5-S01 (OpenAPI versionado e verificado)  
> **Entrega:** GAP-01, GAP-04, GAP-05, GAP-06, GAP-10, GAP-17, GAP-21, GAP-27  
> **Specs de Referência:**
>
> - [`docs/specs/08-blindagem-de-seguranca.md`](file:///docs/specs/08-blindagem-de-seguranca.md) (§2, §3.1, §3.3, §8.1)
> - [`docs/specs/04-autenticacao-e-seguranca.md`](file:///docs/specs/04-autenticacao-e-seguranca.md) (§4, §6)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md`](file:///docs/sprints/fase-5-producao/F5-S02-blindagem-de-borda-e-rate-limit.md) (Brief canônico do sprint)
> - [`.agents/memory/DECISIONS.md`](file:///.agents/memory/DECISIONS.md) (**D-19**, **D-49**, **D-50**, **D-56**)

---

## 1. Verificação Prévia de Assinatura (§5.1 do Sprint Brief)

Em cumprimento obrigatório à seção §5.1 do brief antes de qualquer escrita de código, foi inspecionado o pacote instalado `better-auth@1.7.2` e seu núcleo `@better-auth/core@1.7.2`:

1. **Definição de Tipos TypeScript (`node_modules/@better-auth/core/src/types/init-options.ts:294-340`):**
   ```typescript
   export type BetterAuthAdvancedOptions = {
     ipAddress?: {
       ipAddressHeaders?: string[];
       disableIpTracking?: boolean;
       ipv6Subnet?: number;
       trustedProxies?: string[];
     };
     // ...
   };
   ```
2. **Resolução em Runtime (`node_modules/@better-auth/core/dist/utils/ip.mjs:172-217`):**
   A função `getIP(req, options)` lê explicitamente `options.advanced?.ipAddress?.ipAddressHeaders` (com fallback default para `['x-forwarded-for']`) e invoca `getIPFromHeader(value, { trustedProxies: options.advanced?.ipAddress?.trustedProxies, ... })`.
3. **Validação de Inicialização (`node_modules/better-auth/dist/context/create-context.mjs:90-94`):**
   Valida `options.advanced?.ipAddress?.trustedProxies` via `findInvalidTrustedProxies()`, emitindo warning caso algum item não seja IP ou CIDR válido.
4. **Alerta de Fallback do Rate Limiter (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:233,242`):**
   Instrui explicitamente: _"set `advanced.ipAddress.ipAddressHeaders` or `advanced.ipAddress.trustedProxies` so the address can be resolved"_.

**Conclusão da §5.1:** A assinatura confere **100%** com o formato canônico esperado pela §5.4. Não há necessidade de recorrer ao fallback de `getIP`. A configuração seguirá diretamente a especificação formal.

---

## 2. Contexto e Objetivos Técnicos

Este sprint resolve o **único achado CRÍTICO da auditoria de segurança** e fecha 8 GAPs empilhados na camada de borda da aplicação:

1. **Ativação Real do Rate Limit Global do Fastify (GAP-01):**
   - `src/plugins/rate-limit.plugin.ts:8` continha `global: env.NODE_ENV === 'development'`, a negação exata de D-19 e da spec 04 §4. Em produção, governava 0 rotas.
   - Passa a ser `global: config.NODE_ENV === 'production'`, tornando o limitador global ativo em produção e inativo em dev/test.
   - Extrai `buildRateLimitOptions(config: Env)` para permitir teste unitário puro do objeto de configuração sem necessidade de instanciar o servidor.
2. **Topologia de Proxy Declarada e Defesa Contra Forja de IP (GAP-04, GAP-10 · D-50):**
   - Configura `trustProxy: env.TRUST_PROXY_HOPS` no Fastify (número estrito de saltos, **jamais `true`**).
   - Introduz em `src/config/env.ts` as variáveis `TRUST_PROXY_HOPS` (int ≥ 0) e `TRUSTED_PROXIES` (CSV de CIDRs), ambas obrigatórias em `production` sob pena de `process.exit(1)`.
   - Implementa a função pura `resolveClientIp` em `src/shared/utils/client-ip.ts` realizando varredura da direita para a esquerda contra CIDRs validados via `node:net` (`net.BlockList`).
   - Configura `advanced.ipAddress` no Better Auth com `trustedProxies: TRUSTED_PROXY_LIST` e `ipAddressHeaders: ['x-forwarded-for']`.
3. **Cobertura Efetiva das Rotas Críticas de Autenticação (GAP-05, GAP-06):**
   - Amplia `rateLimit.customRules` para **8 entradas normativas** exportadas como constante `AUTH_RATE_LIMIT_RULES`.
   - Adiciona proteção ao endpoint nativo `/request-password-reset` (GAP-05, espelhando `/forget-password` em 3 req/hora).
   - Adiciona proteção a `/sign-in/email` (GAP-06, limitando tentativas de força bruta a 5 req/min).
   - Todas as chaves estritamente relativas ao `basePath` (prefixadas com `/` e sem `/api/auth`).
4. **Limpeza e Honestidade do Rate Limit do Fastify (Remoção de Código Morto):**
   - O `keyGenerator` atual tentava ler `req.user?.id` num hook (`onRequest`) executado antes do hook que popula `request.user`, mascarado por cast inseguro `as unknown as`.
   - O `keyGenerator` passa a usar puramente `req.ip` provisoriamente, aguardando a chave final por sessão em F5-S07 (D-55).
5. **Ocultação do Swagger UI em Produção (GAP-17 · D-56):**
   - A geração OpenAPI (`@fastify/swagger`) continua incondicional para atender `pnpm openapi:export`.
   - O registro do `@fastify/swagger-ui` (`/docs`) passa a ser condicional à função pura `shouldExposeSwaggerUi(env.NODE_ENV)` (retornando 404 em produção, prevenindo exposição de inventário e contornando bloqueio de scripts inline pela CSP do Helmet).
6. **Remoção de Segredo Estático no CI (GAP-21):**
   - Substitui o literal de segredo no job do `.github/workflows/ci.yml` por geração efêmera segura em tempo de execução (`echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> "$GITHUB_ENV"`).
7. **Higienização de Identificador de Requisição (GAP-27):**
   - Implementa `resolveRequestId` em `src/shared/utils/request-id.ts` com validação de formato e truncagem em 64 caracteres válidos (`^[A-Za-z0-9._-]+$`), impedindo poluição ou injeção nos logs do Pino.
8. **Validação e Testes Automatizados (T1–T32):**
   - Implementa 26 testes unitários isolados e 6 testes de integração sem regressão ou geração de flakes.

---

## 3. Blast Radius Estritamente Fechado

Conforme Seção 4 do sprint brief:

```
blast-radius/
├── Criar:
│   ├── src/shared/utils/request-id.ts               # Função pura resolveRequestId (GAP-27)
│   ├── src/shared/utils/client-ip.ts                # Função pura resolveClientIp (GAP-04)
│   ├── tests/unit/shared/utils/request-id.test.ts   # Casos T7 a T11
│   ├── tests/unit/shared/utils/client-ip.test.ts    # Casos T12 a T18
│   ├── tests/unit/plugins/rate-limit.plugin.test.ts # Casos T1 a T6
│   ├── tests/unit/plugins/swagger.plugin.test.ts    # Casos T24 a T26
│   ├── tests/integration/auth-rate-limit.test.ts    # Casos T27 a T32
│   └── docs/agents-plans/plan-f5s02-blindagem-de-borda-e-rate-limit.md # Este documento
│
├── Editar:
│   ├── src/config/env.ts                            # TRUST_PROXY_HOPS, TRUSTED_PROXIES, TRUSTED_PROXY_LIST, superRefine
│   ├── src/app.ts                                   # trustProxy, genReqId sanitizado
│   ├── src/plugins/rate-limit.plugin.ts             # buildRateLimitOptions, correção de global e keyGenerator honesto
│   ├── src/plugins/swagger.plugin.ts                # shouldExposeSwaggerUi e registro condicional do swaggerUi
│   ├── src/modules/auth/auth.config.ts              # advanced.ipAddress e customRules (8 entradas)
│   ├── .env.example                                 # Documentação de TRUST_PROXY_HOPS e TRUSTED_PROXIES
│   ├── .github/workflows/ci.yml                     # Segredo efêmero via openssl no CI
│   ├── tests/unit/config/env.test.ts                # Casos T19 a T23 e ajuste de T1
│   ├── .agents/memory/PROGRESS.md                   # Atualização do estado do sprint F5-S02
│   └── .agents/memory/F5-S02.md                     # Memória técnica detalhada do sprint
│
└── Fora do Escopo (Terminantemente Proibido Alterar):
    ├── .agents/memory/DECISIONS.md                  # D-19, D-49, D-50, D-56 já vigentes (zero adições de D-NN)
    ├── docs/openapi.json                            # Nenhuma rota, schema ou contrato externo muda
    ├── src/modules/auth/auth.plugin.ts              # Ponte de auth permanece intocada
    ├── src/db/** e drizzle/**                       # Nenhuma tabela ou migration é criada/alterada
    ├── src/modules/{users,playlists,favorites,artists,tracks}/** # Zero alterações em domínios
    ├── src/plugins/{cors,helmet,under-pressure,error-handler,health}.plugin.ts # Inalterados
    ├── src/shared/email/**                          # Inalterado
    └── tests/e2e/**                                 # Suíte E2E permanece intocada
```

---

## 4. Especificação Técnica e Contratos de Implementação

### 4.1 `src/config/env.ts`

- Adicionar ao `envSchema`:
  ```typescript
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  TRUSTED_PROXIES: z.string().default(''),
  ```
- No método `.superRefine(v, ctx)`:
  ```typescript
  if (v.NODE_ENV === 'production') {
    if (!v.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required in production',
      });
    }
    if (v.TRUST_PROXY_HOPS < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'TRUST_PROXY_HOPS must be >= 1 in production (D-50)',
      });
    }
    if (!v.TRUSTED_PROXIES.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUSTED_PROXIES'],
        message: 'TRUSTED_PROXIES must list the edge CIDRs in production (D-50)',
      });
    }
  }
  ```
- Na interface `Env`:
  ```typescript
  TRUST_PROXY_HOPS: number;
  TRUSTED_PROXIES: string;
  TRUSTED_PROXY_LIST: string[];
  ```
- Na função `parseEnv`:
  ```typescript
  const trustedProxyList = parsed.TRUSTED_PROXIES.split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean);

  return {
    ...parsed,
    CORS_ORIGIN_LIST: corsOriginList,
    TRUSTED_PROXY_LIST: trustedProxyList,
    SOCIAL_PROVIDERS: socialProviders,
  };
  ```
- Exportar:
  ```typescript
  export const TRUSTED_PROXY_LIST: string[] = env.TRUSTED_PROXY_LIST;
  ```

### 4.2 `src/shared/utils/request-id.ts`

- Função pura para sanitização e garantia de formato do Request ID:
  ```typescript
  import { randomUUID } from 'node:crypto';

  const VALID_REQUEST_ID_REGEX = /^[A-Za-z0-9._-]+$/;

  export function resolveRequestId(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length === 0) {
      return randomUUID().slice(0, 8);
    }

    if (!VALID_REQUEST_ID_REGEX.test(raw)) {
      return randomUUID().slice(0, 8);
    }

    return raw.slice(0, 64);
  }
  ```

### 4.3 `src/shared/utils/client-ip.ts`

- Resolução segura de IP do cliente através de proxies reversos via `node:net` (`net.BlockList`):
  ```typescript
  import net from 'node:net';

  function createBlockList(trustedProxies: readonly string[]): net.BlockList {
    const blockList = new net.BlockList();
    for (const entry of trustedProxies) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed.includes('/')) {
        const [addr, prefixStr] = trimmed.split('/');
        const prefix = parseInt(prefixStr, 10);
        const type = net.isIP(addr);
        if (type === 4) blockList.addSubnet(addr, prefix, 'ipv4');
        else if (type === 6) blockList.addSubnet(addr, prefix, 'ipv6');
      } else {
        const type = net.isIP(trimmed);
        if (type === 4) blockList.addAddress(trimmed, 'ipv4');
        else if (type === 6) blockList.addAddress(trimmed, 'ipv6');
      }
    }
    return blockList;
  }

  function isIpTrusted(blockList: net.BlockList, ip: string): boolean {
    const type = net.isIP(ip);
    if (type === 4) return blockList.check(ip, 'ipv4');
    if (type === 6) return blockList.check(ip, 'ipv6');
    return false;
  }

  export function resolveClientIp(
    headers: Record<string, string | string[] | undefined>,
    trustedProxies: readonly string[],
    socketIp: string,
  ): string {
    if (!trustedProxies || trustedProxies.length === 0) {
      return socketIp;
    }

    const rawHeader = headers['x-forwarded-for'] ?? headers['X-Forwarded-For'];
    if (!rawHeader) {
      return socketIp;
    }

    const headerStr = Array.isArray(rawHeader) ? rawHeader.join(',') : rawHeader;
    const ips = headerStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length === 0) {
      return socketIp;
    }

    const blockList = createBlockList(trustedProxies);

    // Se o socket que conectou diretamente não for de um proxy confiável,
    // a requisição veio direto do cliente ou de um salto não autorizado; o XFF foi forjado.
    if (!isIpTrusted(blockList, socketIp)) {
      return socketIp;
    }

    // Varredura rigorosa da direita para a esquerda:
    // O primeiro salto que NÃO pertencer a nenhum CIDR confiável é o cliente.
    for (let i = ips.length - 1; i >= 0; i--) {
      const candidate = ips[i];
      if (!isIpTrusted(blockList, candidate)) {
        return candidate;
      }
    }

    // Se todos os saltos forem confiáveis, o cliente é o socketIp original.
    return socketIp;
  }
  ```

### 4.4 `src/plugins/rate-limit.plugin.ts`

- Correção do bug crítico, extração para testabilidade e eliminação de código morto:
  ```typescript
  import rateLimit, { type FastifyRateLimitOptions } from '@fastify/rate-limit';
  import type { FastifyPluginCallback, FastifyRequest } from 'fastify';
  import fp from 'fastify-plugin';
  import { env, type Env } from '../config/env.js';

  export function buildRateLimitOptions(config: Env): FastifyRateLimitOptions {
    return {
      global: config.NODE_ENV === 'production',
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW,
      allowList: (req: FastifyRequest) => req.url.startsWith('/health'),
      keyGenerator: (req: FastifyRequest) => req.ip,
    };
  }

  export const rateLimitPlugin: FastifyPluginCallback = fp(
    async (fastify) => {
      await fastify.register(rateLimit, buildRateLimitOptions(env));
    },
    { name: 'rate-limit-plugin' },
  );
  ```

### 4.5 `src/plugins/swagger.plugin.ts`

- Extração da função de decisão e registro condicional da UI:
  ```typescript
  export function shouldExposeSwaggerUi(nodeEnv: string): boolean {
    return nodeEnv !== 'production';
  }

  // Dentro do plugin:
  if (shouldExposeSwaggerUi(env.NODE_ENV)) {
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }
  ```

### 4.6 `src/modules/auth/auth.config.ts`

- Inclusão das 8 regras estritas em constante nomeada e configuração de proxies:
  ```typescript
  import { env, isProduction, SOCIAL_PROVIDERS, TRUSTED_PROXY_LIST } from '../../config/env.js';

  export const AUTH_RATE_LIMIT_RULES = {
    '/forget-password': { window: 3600, max: 3 },
    '/request-password-reset': { window: 3600, max: 3 },
    '/send-verification-email': { window: 3600, max: 3 },
    '/reset-password': { window: 3600, max: 5 },
    '/sign-in/email': { window: 60, max: 5 },
    '/sign-up/email': { window: 3600, max: 10 },
    '/change-password': { window: 3600, max: 10 },
    '/sign-in/social': { window: 60, max: 10 },
  } as const;

  // Dentro de createAuth():
  rateLimit: {
    enabled: isProduction,
    window: 60,
    max: 10,
    customRules: AUTH_RATE_LIMIT_RULES,
  },
  // ...
  advanced: {
    disableOriginCheck: false,
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
      trustedProxies: TRUSTED_PROXY_LIST,
    },
  },
  ```

### 4.7 `src/app.ts`

- Injeção de `trustProxy` e `resolveRequestId`:
  ```typescript
  import { resolveRequestId } from './shared/utils/request-id.js';

  const app = Fastify({
    trustProxy: env.TRUST_PROXY_HOPS,
    logger: {
      // inalterado
    },
    genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
  }).withTypeProvider<ZodTypeProvider>();
  ```

### 4.8 `.env.example`

- Placeholders com documentação clara:
  ```bash
  # Topologia de proxy (D-50). Obrigatórias em produção; F5-S08 preenche os valores da Railway.
  # 0 = sem proxy à frente (desenvolvimento local). Em produção, o número de saltos até a app.
  TRUST_PROXY_HOPS=0
  # CSV de CIDRs da borda confiável. Vazio fora de produção.
  TRUSTED_PROXIES=
  ```

### 4.9 `.github/workflows/ci.yml`

- Remoção do literal `BETTER_AUTH_SECRET: troque-por-um-segredo-...` do bloco `env` geral do job.
- Inserção do passo de geração de segredo efêmero antes do `Install dependencies`:
  ```yaml
  - name: Generate ephemeral auth secret
    run: echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> "$GITHUB_ENV"
  ```

---

## 5. Plano de Cobertura de Testes (T1 a T32)

### Unitários — `tests/unit/plugins/rate-limit.plugin.test.ts` (T1 a T6)

- **T1:** `buildRateLimitOptions` com `NODE_ENV: 'production'` → `global === true` (GAP-01 validado).
- **T2:** `buildRateLimitOptions` com `NODE_ENV: 'development'` → `global === false`.
- **T3:** `buildRateLimitOptions` com `NODE_ENV: 'test'` → `global === false`.
- **T4:** `allowList` com `/health` e `/health/ready` → `true` em ambos.
- **T5:** `allowList` com `/api/v1/tracks` → `false`.
- **T6:** `max` e `timeWindow` refletem exatamente `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW` passados no config.

### Unitários — `tests/unit/shared/utils/request-id.test.ts` (T7 a T11)

- **T7:** `'req-abc_123.4'` devolvido inalterado.
- **T8:** String de 200 caracteres válidos truncada exatamente em 64 caracteres.
- **T9:** Caracteres proibidos/injeção (`'req abc\nSet-Cookie: x'`) ignorados e ID randômico gerado.
- **T10:** Entradas inválidas (`undefined`, `''`, `123`, `['a','b']`) geram ID randômico válido de 8 caracteres.
- **T11:** Duas invocações consecutivas sem entrada produzem IDs distintos.

### Unitários — `tests/unit/shared/utils/client-ip.test.ts` (T12 a T18)

- **T12:** `trustedProxies` vazio com XFF presente → retorna `socketIp`.
- **T13:** XFF ausente → retorna `socketIp`.
- **T14:** `XFF: '203.0.113.9, 10.0.0.5'`, socket `10.0.0.5`, confiável `10.0.0.0/8` → retorna `203.0.113.9`.
- **T15:** `XFF: '203.0.113.9'`, socket `198.51.100.7`, confiável `10.0.0.0/8` → retorna `198.51.100.7` (forja ignorada).
- **T16:** Dois saltos confiáveis (`'203.0.113.9, 10.0.0.5, 10.0.0.6'`), socket `10.0.0.6` → retorna `203.0.113.9`.
- **T17:** Todos os saltos confiáveis (`'10.0.0.4, 10.0.0.5'`), socket `10.0.0.5` → retorna `socketIp` (`10.0.0.5`).
- **T18:** IPv6 em CIDR IPv6 confiável (`'2001:db8:85a3::8a2e:370:7334, 2001:db8::1'`), socket `2001:db8::1`, confiável `2001:db8::/32` → resolve sem lançar exceção.

### Unitários — `tests/unit/config/env.test.ts` (T19 a T23 + Atualização de T1)

- **T1:** Atualizar asserção para incluir defaults `TRUST_PROXY_HOPS: 0`, `TRUSTED_PROXIES: ''` e `TRUSTED_PROXY_LIST: []`.
- **T19:** `NODE_ENV: 'production'` sem `TRUST_PROXY_HOPS` (ou com `0`) → lança `ZodError` citando `TRUST_PROXY_HOPS`.
- **T20:** `NODE_ENV: 'production'` com `TRUSTED_PROXIES` vazio → lança `ZodError` citando `TRUSTED_PROXIES`.
- **T21:** `NODE_ENV: 'production'` com ambas preenchidas corretamente e `RESEND_API_KEY` → parseia com sucesso.
- **T22:** `NODE_ENV: 'development'` sem nenhuma das duas → parseia com sucesso atribuindo `0`, `''` e `[]`.
- **T23:** `TRUSTED_PROXIES: ' 10.0.0.0/8 , ,172.16.0.0/12 '` → `TRUSTED_PROXY_LIST` normalizado para `['10.0.0.0/8', '172.16.0.0/12']`.

### Unitários — `tests/unit/plugins/swagger.plugin.test.ts` (T24 a T26)

- **T24:** `shouldExposeSwaggerUi('production')` → `false`.
- **T25:** `shouldExposeSwaggerUi('development')` → `true`.
- **T26:** `shouldExposeSwaggerUi('test')` → `true`.

### Integração — `tests/integration/auth-rate-limit.test.ts` (T27 a T32)

- **T27:** `AUTH_RATE_LIMIT_RULES` contém exatamente as 8 chaves esperadas, nenhuma a mais.
- **T28:** Regras de `'/forget-password'` e `'/request-password-reset'` são rigorosamente idênticas (`window: 3600, max: 3`).
- **T29:** Todas as chaves começam com `/` e nenhuma contém `/api/auth` (relativas ao `basePath`).
- **T30:** 20 requisições consecutivas para `POST /api/auth/sign-in/email` em ambiente de teste não resultam em nenhum código HTTP 429 (preservando D-19).
- **T31:** Fluxo completo de sign-up → verificação de e-mail → sign-in executa com sucesso sem regressão.
- **T32:** `GET /api/auth/get-session` com Bearer token válido retorna HTTP 200 (garantindo integridade da ponte).

---

## 6. Definition of Done e Verificação Manual

### Validação Automatizada de Portões:

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build
pnpm openapi:export -- --check
```

### Verificação Manual com Build de Produção (§7 do Brief):

1. **Boot falha fechado (D-50):**
   ```bash
   NODE_ENV=production RESEND_API_KEY=re_x node dist/server.js
   # Deve emitir erro [Config Error] citando TRUST_PROXY_HOPS e TRUSTED_PROXIES e sair com code 1.
   ```
2. **Subida temporária em modo produção:**
   ```bash
   NODE_ENV=production TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
     RESEND_API_KEY=re_fake_para_boot CORS_ORIGIN=http://localhost:3333 \
     node dist/server.js &
   ```
3. **Disparar testes com curl conforme §7 do brief:**
   - Teste 1: 120 requisições a `GET /api/v1/tracks` → 200 até ~100, seguido de 429 (GAP-01).
   - Teste 2: 6 requisições a `POST /api/auth/request-password-reset` → três 200 seguidos de 429 (GAP-05).
   - Teste 3: 10 requisições a `POST /api/auth/sign-in/email` com XFF forjado → 429 a partir da 6ª tentativa (GAP-04).
   - Teste 4: `GET /docs` → 404 e `GET /health` → 200 (GAP-17).
4. **Verificação estrita de código estático:**
   - `grep -n "NODE_ENV === 'development'" src/plugins/rate-limit.plugin.ts` → **Vazio**
   - `grep -rn "as unknown as" src/plugins/rate-limit.plugin.ts` → **Vazio**
   - `grep -n "troque-por-um-segredo" .github/workflows/ci.yml` → **Vazio**
   - `grep -rn "trustProxy: true" src/` → **Vazio**

---

## 7. Rastreabilidade de Armadilhas Conhecidas (§8 do Brief)

1. **GAP-01 + GAP-10 acoplados:** `global: production` e `trustProxy: env.TRUST_PROXY_HOPS` entram no mesmo commit para evitar DoS coletivo em clientes atrás do proxy.
2. **`trustProxy: true` estritamente proibido:** Utiliza sempre a contagem numérica de hops de `env.TRUST_PROXY_HOPS`.
3. **Caminhos de `customRules`:** Todas as chaves são relativas a `basePath` (ex: `/sign-in/email`, não `/api/auth/sign-in/email`).
4. **Endpoint nativo protegido:** `/request-password-reset` recebe regra idêntica à do alias `/forget-password`.
5. **Sem `NODE_ENV=production` nos testes automatizados:** O comportamento em produção é comprovado pela integridade do objeto de opções (`buildRateLimitOptions`) e pelos testes manuais de fumaça, sem poluir os testes automatizados com flakes de 429.
6. **Varredura XFF da direita para a esquerda:** A função `resolveClientIp` inspeciona a partir do último salto confiável para neutralizar forjas à esquerda.
7. **Swagger especificação preservada:** `@fastify/swagger` permanece sempre registrado, apenas `@fastify/swagger-ui` torna-se condicional.
8. **Contrato OpenAPI inalterado:** Nenhuma rota de negócio tem sua interface modificada; `pnpm openapi:export -- --check` não exigirá alteração em `docs/openapi.json`.
9. **Zero dependências novas de rede:** Resolução de CIDR implementada com o nativo `node:net` (`net.BlockList`).
10. **Assinatura confirmada:** Validada nativamente no pacote instalado `@better-auth/core@1.7.2`.
11. **Ordem de plugins Fastify preservada:** O `rateLimitPlugin` mantém sua posição antes do `authPlugin`, cobrindo as rotas `/api/auth/*`.
