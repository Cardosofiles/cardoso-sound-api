# F5-S07 — Rate Limit Distribuído e Origens Confiáveis

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Fase**       | F5 — Produção · **6º e último sprint de blindagem** (D-49)   |
| **Branch**     | `feature/f5s07-rate-limit-distribuido`                       |
| **Depende de** | F5-S06                                                       |
| **Entrega**    | GAP-11, GAP-12, GAP-18 · **encerra os 27 GAPs da auditoria** |

> **Último sprint antes do deploy.** Quando ele fechar, os 27 GAPs de
> `docs/issue/AUTHENTICATION.md` estão corrigidos e a aplicação pode ir a produção sem achado
> aberto — que é a razão de D-49 ter posto a blindagem inteira antes de F5-S08.
>
> **Nenhuma dependência nova.** O caminho Redis é entregue como **seam**, não como dependência —
> §5.4 explica por que, e é a única parte deste sprint em que a decisão precisa de leitura atenta.

---

## 0. Pré-requisitos

Nenhum trabalho humano. Docker rodando.

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia D-19 (rate limit fora de produção), D-50 (topologia de proxy, entregue em F5-S02),
D-55 (é a decisão que este sprint executa) e D-46-b (trustedProviders).
Leia .agents/memory/F5-S02.md — ele criou buildRateLimitOptions e deixou o keyGenerator
propositalmente incompleto, com só req.ip; este sprint completa. NÃO desfaça o que ele fez.

Sprint alvo: docs/sprints/fase-5-producao/F5-S07-rate-limit-distribuido.md
Specs obrigatórias: docs/specs/08-blindagem-de-seguranca.md (§3.2, §3.3, §6.4, §8.2, §8.3),
                    docs/specs/04-autenticacao-e-seguranca.md (§4, §6)

ANTES de escrever qualquer código, execute a §5.1: confirme se rateLimit.storage: 'database'
existe na versão instalada e QUAL tabela o @better-auth/cli generate produz para ela.
Se o CLI não gerar tabela nenhuma, storage: 'database' não está suportado — PARE e reporte.

Este sprint NÃO altera a ordem de registro do buildApp(). Se a sua solução exigir isso,
ela está errada — leia a §5.3 antes de planejar.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fazer o rate limit continuar valendo quando a aplicação tiver mais de um processo, e fechar a
última porta de entrada não validada da configuração.

Três problemas:

1. **Os dois limitadores contam em memória** (GAP-12). Com `k` réplicas na Railway o limite
   efetivo é `k × max`, e o round-robin distribui as tentativas entre réplicas sem nenhum esforço
   do atacante. A regra de 3 resets por hora vira 9 com três réplicas.
2. **O `keyGenerator` tem um ramo morto** (GAP-11). `req.user?.id` é lido num hook que roda
   **antes** do hook que popula `request.user`, e o cast `as unknown as` esconde isso do type
   checker. F5-S02 removeu o ramo e deixou só `req.ip`; falta a dimensão de identidade — feita do
   jeito certo.
3. **`MOBILE_DEEP_LINK` e `CORS_ORIGIN` entram sem validação de formato** (GAP-18).
   `trustedOrigins` alimenta o `originCheck`, que é o que sustenta a proteção contra open redirect
   provada por T24/T25 de F3-S03. Um `*` ou um domínio de terceiro passa pelo Zod sem nenhum sinal
   no boot e desarma essa proteção em silêncio.

**Não faz parte deste sprint:** instalar cliente Redis (§5.4) · mudar a ordem de registro do
`buildApp()` (§5.3) · qualquer coisa de 2FA, Passkey ou `emailAndPassword`.

---

## 3. Contratos esperados

### 3.1 `src/config/env.ts` — uma variável nova e duas validações

| Variável               | Tipo Zod           | Default | Obrigatória |
| ---------------------- | ------------------ | ------- | ----------- |
| `RATE_LIMIT_REDIS_URL` | `url().optional()` | —       | não         |

Mais o endurecimento das duas existentes (spec `08` §8.3):

```ts
MOBILE_DEEP_LINK: z
  .string()
  .regex(/^[a-z][a-z0-9+.-]*:\/\/[^*\s]*$/, 'must be a scheme URL without wildcards')
  .optional(),
```

E `CORS_ORIGIN_LIST`, no derivado: quando `NODE_ENV === 'production'`, **cada item** precisa casar
`/^https?:\/\/[^*\s]+$/`. Item inválido — `*` inclusive — derruba o boot.

> Fora de produção, `CORS_ORIGIN` continua permissivo: D-19 manda `origin: true` em dev e test, e
> a lista nem é consultada. A validação estrita vale **só** em produção.

### 3.2 `rate-limit.plugin.ts` — a chave final

Forma normativa: **spec `08` §3.2**.

```ts
export function extractSessionToken(headers: IncomingHttpHeaders): string | null;
export function rateLimitKeyGenerator(req: FastifyRequest): string;
export function buildRateLimitOptions(config: Env): FastifyRateLimitOptions; // já existe
```

```ts
export function rateLimitKeyGenerator(req: FastifyRequest): string {
  const ip = req.ip; // resolvido pelo trustProxy de F5-S02 (D-50)
  if (req.url.startsWith('/api/auth')) return ip;
  const token = extractSessionToken(req.headers);
  return token ? `${ip}|${sha256(token).slice(0, 16)}` : ip;
}
```

### 3.3 `auth.config.ts` — uma chave

```ts
rateLimit: {
  enabled: isProduction,
  storage: 'database',   // D-55 — exige a tabela da §3.4
  window: 60,
  max: 10,
  customRules: AUTH_RATE_LIMIT_RULES,   // as 13 entradas, completas desde F5-S06
},
```

### 3.4 Schema — a tabela `rate_limit`

**A forma exata é ditada pelo adapter, não por este sprint.** Rode
`pnpm dlx @better-auth/cli@latest generate` e use o que ele produzir (spec `08` §6.4). Não invente
colunas; não copie de outro projeto.

---

## 4. Blast radius

### Criar

```
drizzle/000X_*.sql                                     # tabela rate_limit, gerada e revisada
tests/unit/plugins/rate-limit-key.test.ts
tests/integration/schema-rate-limit.test.ts
```

### Editar

```
src/config/env.ts                    # RATE_LIMIT_REDIS_URL + validações da §3.1
src/plugins/rate-limit.plugin.ts     # extractSessionToken + keyGenerator final + seam do store
src/modules/auth/auth.config.ts      # rateLimit.storage
src/db/schema/users.schema.ts        # tabela rate_limit (conforme o CLI)
src/db/schema/index.ts               # reexportação
.env.example                         # RATE_LIMIT_REDIS_URL comentada
tests/unit/config/env.test.ts        # casos novos
.agents/memory/PROGRESS.md
.agents/memory/F5-S07.md
```

**Não toque em:** `src/app.ts` (**a ordem de registro é intocável** — §5.3) ·
`src/modules/auth/auth.plugin.ts` · `src/plugins/{cors,helmet,under-pressure,error-handler,health,swagger}.plugin.ts` ·
`src/modules/{users,playlists,favorites,artists,tracks}/**` · `src/shared/email/**` ·
migrações já aplicadas · `tests/e2e/**` · `package.json` (**nenhuma dependência nova** — §5.4).

> **`DECISIONS.md` não está na lista.** D-55 cobre este sprint. **Exceção:** se a §5.1 provar que
> `storage: 'database'` não existe na versão instalada, isso muda a decisão — **pare e pergunte**,
> não escolha uma alternativa sozinho.

---

## 5. Passo a passo

### 5.1 Confirmar `storage: 'database'` — antes de qualquer código

```bash
grep -rn "storage" node_modules/better-auth/dist/types/*.d.ts | grep -i "rate" | head
grep -rn "'database'\|\"database\"" node_modules/better-auth/dist/rate-limiter/*.mjs | head
```

Depois, com a chave já escrita na config:

```bash
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts
```

**O CLI é a fonte da verdade para a §3.4.** Três desfechos:

- Gera uma tabela → escreva-a no schema Drizzle **exatamente** como ele pede.
- Não gera nada e `storage: 'database'` existe → a tabela pode ter outro nome ou ser criada em
  runtime; investigue no `dist/` e **reporte o que achou** antes de seguir.
- `storage: 'database'` não existe → **pare e reporte**. D-55 escolheu esse caminho justamente
  para não introduzir serviço novo; se ele não estiver disponível, a decisão precisa ser revista
  pelo dono.

### 5.2 A chave do rate limit (GAP-11)

Duas dimensões, e a ordem do raciocínio importa:

- **Em `/api/auth/**` a chave é só o IP.** Chavear por identidade numa rota de autenticação é
  regressão: um atacante com N contas obteria N × a cota, e é exatamente nessas rotas que o
  atacante controla quantas contas tem.
- **Em `/api/v1/**` a chave é `IP + hash do token de sessão`**, quando houver token. O IP
  **permanece** na chave: chavear só por sessão permitiria multiplicar a cota criando sessões.
  Combinar as duas dimensões **estreita** a cota, nunca a alarga — e essa é a única razão pela
  qual isso é seguro.

`extractSessionToken` lê o `Authorization: Bearer` ou o cookie de sessão **do header**, sem tocar
no banco. É por isso que funciona no `onRequest` do rate limit, que roda antes do hook de sessão —
e é por isso que não precisamos mexer na ordem de registro.

O hash é obrigatório: a chave do rate limit pode aparecer em métrica, log de erro do plugin e
mensagem de diagnóstico. **Token de sessão em claro numa chave é vazamento de credencial.**
`sha256` do `node:crypto`, 16 caracteres do hex — colisão nesse espaço não tem consequência de
segurança, só juntaria duas cotas.

### 5.3 Por que a ordem do `buildApp()` não muda — leia antes de "consertar"

A leitura ingênua do GAP-11 é: "o hook do rate limit roda antes do hook de sessão, então basta
registrar o rate limit depois do `authPlugin`". **Está errado por dois motivos independentes:**

1. A rota coringa `/api/auth/*` é registrada **dentro** do `authPlugin`. O `@fastify/rate-limit`
   com `global: true` governa as rotas registradas **depois** dele. Movê-lo para depois tira do
   teto justamente as rotas de autenticação — as únicas que ainda estariam protegidas hoje,
   e as que mais importam.
2. Mesmo que funcionasse, chavear por `user.id` em rota de autenticação daria N × cota a quem
   tem N contas (§5.2).

A ordem de registro do `buildApp()` é **load-bearing** e está documentada assim desde F1-S05.
A solução da §5.2 resolve o GAP sem tocá-la. Se o seu plano incluir mover `rateLimitPlugin`,
o plano está errado.

### 5.4 O caminho Redis — seam agora, dependência quando for preciso

D-55 diz que o armazenamento compartilhado do limitador Fastify "vira configuração, não código".
Este sprint entrega **a configuração e o ponto de extensão**, e **não instala cliente Redis**.

O motivo é honesto: uma dependência de produção que nenhum ambiente usa hoje é superfície de
supply chain sem contrapartida, e adicioná-la exigiria ADR próprio (D-32). O que se entrega:

```ts
// dentro de buildRateLimitOptions
...(config.RATE_LIMIT_REDIS_URL ? { redis: await createRedisClient(config.RATE_LIMIT_REDIS_URL) } : {}),
```

`createRedisClient` faz `import('ioredis')` **dinâmico** e, se o pacote não estiver instalado,
lança com uma mensagem explícita:

```
RATE_LIMIT_REDIS_URL está definida mas `ioredis` não está instalado.
Rode `pnpm add ioredis` e registre o ADR correspondente (D-32).
```

Falha **fechada e legível**: ninguém liga a variável achando que ligou o Redis. E o dia em que a
segunda réplica for necessária, é `pnpm add ioredis` + a variável, sem tocar em código.

**Enquanto `RATE_LIMIT_REDIS_URL` não existir em produção, a aplicação roda com réplica única.**
Isso é restrição operacional, não detalhe: registre em `PROGRESS.md` como pendência para F5-S08
gravar no runbook de deploy e fixar `replicas: 1` no `railway.json`.

> **O limitador do Better Auth não tem essa restrição** — ele passa a contar no PostgreSQL (§3.3).
> E é ele que protege sign-in, reset de senha e verificação de segundo fator: as rotas em que
> `k × max` seria de fato perigoso. O limitador global do Fastify protege contra volume, onde uma
> escrita no banco por requisição seria pior que a doença.

### 5.5 Origens confiáveis (GAP-18)

`trustedOrigins` alimenta o `originCheck`, que é o que faz T24 e T25 de F3-S03 passarem. Hoje
`MOBILE_DEEP_LINK` é `z.string().optional()`: um `*`, uma string vazia significativa ou um domínio
de terceiro entram como origem confiável **sem nenhum sinal no boot**.

Aplique a §3.1. Dois cuidados:

- O regex **rejeita `*` explicitamente** (`[^*\s]*`). O Better Auth aceita padrões com curinga em
  `trustedOrigins`, o que amplia muito o alcance de um valor mal digitado.
- A validação estrita de `CORS_ORIGIN_LIST` vale **só em produção**. Em dev e test, D-19 manda
  `origin: true` e a lista nem é consultada — validar ali só quebraria ambiente de
  desenvolvimento sem ganho nenhum.

### 5.6 Fechamento da auditoria

Este é o último sprint da blindagem. Antes de abrir o PR, percorra a **spec `08` §10** (tabela de
rastreabilidade GAP × sprint) e confirme, item a item, que os 27 GAPs têm sprint entregue.
Qualquer um sem entrega correspondente é **buraco de planejamento** — reporte, não improvise.

O portão formal continua sendo F5-S09 com a spec `08` §9; aqui é só a conferência de cobertura.

---

## 6. Casos de teste obrigatórios

### Unit — `tests/unit/plugins/rate-limit-key.test.ts`

| #   | Caso                                                                       | Esperado                             |
| --- | -------------------------------------------------------------------------- | ------------------------------------ |
| T1  | `keyGenerator` em `/api/auth/sign-in/email` com bearer                     | **só o IP** — sem dimensão de sessão |
| T2  | `keyGenerator` em `/api/v1/me` **sem** token                               | só o IP                              |
| T3  | `keyGenerator` em `/api/v1/me` **com** bearer                              | `ip                                  | <hash>`; contém o IP |
| T4  | Dois tokens diferentes, mesmo IP, mesma rota                               | chaves **diferentes**                |
| T5  | Mesmo token, IPs diferentes                                                | chaves **diferentes**                |
| T6  | A chave gerada **não contém** o token em claro                             | asserção por substring — vazamento   |
| T7  | `extractSessionToken` com `Authorization: Bearer abc`                      | `'abc'`                              |
| T8  | `extractSessionToken` com cookie de sessão (com e sem prefixo `__Secure-`) | o valor do cookie                    |
| T9  | `extractSessionToken` sem header nenhum                                    | `null`                               |
| T10 | `extractSessionToken` com `Authorization: Basic xyz`                       | `null` — só bearer                   |
| T11 | `extractSessionToken` **não** consulta o banco                             | nenhum spy de `pool.query` chamado   |

### Unit — `tests/unit/config/env.test.ts` (casos novos)

| #   | Caso                                                         | Esperado             |
| --- | ------------------------------------------------------------ | -------------------- |
| T12 | `MOBILE_DEEP_LINK='cardososound://auth'`                     | parseia              |
| T13 | `MOBILE_DEEP_LINK='*'`                                       | `ZodError`           |
| T14 | `MOBILE_DEEP_LINK='https://evil.example/*'`                  | `ZodError` — curinga |
| T15 | `MOBILE_DEEP_LINK=''`                                        | `ZodError`           |
| T16 | `production` com `CORS_ORIGIN='*'`                           | `ZodError`           |
| T17 | `production` com `CORS_ORIGIN='https://a.com,https://b.com'` | parseia; 2 itens     |
| T18 | `development` com `CORS_ORIGIN='*'`                          | **parseia** — D-19   |
| T19 | `RATE_LIMIT_REDIS_URL` ausente                               | parseia; `undefined` |
| T20 | `RATE_LIMIT_REDIS_URL='nao-e-url'`                           | `ZodError`           |

### Unit — store seam

| #   | Caso                                               | Esperado                                     |
| --- | -------------------------------------------------- | -------------------------------------------- |
| T21 | `buildRateLimitOptions` sem `RATE_LIMIT_REDIS_URL` | opções **sem** a chave `redis`               |
| T22 | Com a URL e `ioredis` ausente                      | lança com a mensagem da §5.4 — falha fechada |

### Integração — `tests/integration/schema-rate-limit.test.ts`

| #   | Caso                                             | Esperado                           |
| --- | ------------------------------------------------ | ---------------------------------- |
| T23 | Tabela gerada pelo CLI existe no banco           | sim, com as colunas que ele pediu  |
| T24 | `@better-auth/cli generate` sem diferença        | sem diferença                      |
| T25 | Fluxo de auth completo com `storage: 'database'` | verde — sign-up → verify → sign-in |
| T26 | `enabled: isProduction` em ambiente de teste     | nenhum 429 em 20 chamadas — D-19   |

### E2E e regressão

| #   | Caso                                               | Esperado |
| --- | -------------------------------------------------- | -------- |
| T27 | Suíte completa                                     | verde    |
| T28 | Suíte sob `--sequence.shuffle`                     | verde    |
| T29 | T24/T25 de F3-S03 (open redirect) continuam verdes | verde    |

---

## 7. Definition of Done

```bash
docker compose up -d && pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dlx @better-auth/cli@latest generate --config src/modules/auth/auth.config.ts   # sem diferença
pnpm openapi:export -- --check
```

**Boot falha fechado nas origens** (GAP-18):

```bash
NODE_ENV=production MOBILE_DEEP_LINK='*' TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
  RESEND_API_KEY=re_x CORS_ORIGIN=https://a.com node dist/server.js
# esperado: [Config Error] citando MOBILE_DEEP_LINK, exit 1

NODE_ENV=production CORS_ORIGIN='*' TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 \
  RESEND_API_KEY=re_x node dist/server.js
# esperado: [Config Error] citando CORS_ORIGIN, exit 1
```

**Seam do Redis falha legível** (§5.4):

```bash
NODE_ENV=production RATE_LIMIT_REDIS_URL=redis://localhost:6379 \
  TRUST_PROXY_HOPS=1 TRUSTED_PROXIES=10.0.0.0/8 RESEND_API_KEY=re_x \
  CORS_ORIGIN=https://a.com node dist/server.js
# esperado: erro citando `pnpm add ioredis` e D-32 — NUNCA subir em silêncio com contador local
```

**Contadores no banco:**

```bash
docker compose exec -T postgres psql -U cardoso -d cardoso_sound -c '\dt'
# a tabela de rate limit gerada pelo CLI deve aparecer
```

- [ ] T1–T29 verdes
- [ ] Os três comandos de boot acima com a saída esperada
- [ ] `grep -rn "as unknown as" src/plugins/rate-limit.plugin.ts` **vazio**
- [ ] `grep -rn "req.user" src/plugins/rate-limit.plugin.ts` **vazio** — o ramo morto não voltou
- [ ] `git diff src/app.ts` **vazio** — a ordem de registro não mudou (§5.3)
- [ ] `git diff package.json` **vazio** — nenhuma dependência nova (§5.4)
- [ ] A chave do rate limit **nunca** contém token em claro (T6)
- [ ] `AUTH_RATE_LIMIT_RULES` com as **13** entradas da spec `08` §3.3
- [ ] Migração revisada linha a linha; `pnpm db:push` **não** usado
- [ ] **Spec `08` §10 percorrida: os 27 GAPs com sprint entregue** (§5.6)
- [ ] PR verde; memória atualizada com a pendência de réplica única

---

## 8. Armadilhas conhecidas

1. **Mover o `rateLimitPlugin` para depois do `authPlugin`.** Tira do teto a coringa
   `/api/auth/*`, registrada dentro dele. A §5.3 explica; o DoD checa com `git diff src/app.ts`.
2. **Chavear por identidade em `/api/auth`.** N contas, N × cota. O IP é a única chave possível
   ali, justamente porque a identidade é o que o atacante controla.
3. **Tirar o IP da chave em `/api/v1`.** Chave só por sessão permite multiplicar a cota criando
   sessões. As duas dimensões, sempre — T3 e T5 provam.
4. **Token de sessão em claro na chave.** Ela aparece em métrica e em mensagem de diagnóstico do
   plugin. Hash, sempre. T6 existe só para isso.
5. **`extractSessionToken` indo ao banco.** Ele roda no `onRequest` do rate limit, antes do hook
   de sessão — uma consulta ali reintroduz o GAP-13 que F5-S04 acabou de fechar, e no caminho mais
   quente possível. Só header. T11 prova.
6. **Instalar `ioredis` porque "é mais simples".** Dependência de produção que nenhum ambiente usa
   exige ADR (D-32). O seam da §5.4 resolve, e o DoD checa `git diff package.json`.
7. **Ligar `RATE_LIMIT_REDIS_URL` e cair em silêncio no contador local.** Falha fechada e legível.
   Um operador que acha que ligou o Redis e não ligou está pior que um que sabe que não ligou.
8. **Inventar as colunas da tabela `rate_limit`.** A forma é ditada pelo adapter; o CLI é a fonte.
   Copiar de outro projeto produz erro obscuro em runtime — a mesma classe de D-43.
9. **Validar `CORS_ORIGIN` estritamente fora de produção.** D-19 manda `origin: true` em dev e
   test; validar ali só quebra ambiente de desenvolvimento. T18 fixa isso.
10. **Esquecer a reexportação da tabela nova no barrel** `src/db/schema/index.ts`. O adapter
    recebe `* as schema`; fora do barrel, a tabela não existe para ele.
11. **Achar que o sprint acabou sem percorrer a §5.6.** Ele é o último da blindagem; a conferência
    de cobertura dos 27 GAPs é entrega dele.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **nada a acrescentar.** D-55 cobre o sprint. Se a §5.1 provar que
  `storage: 'database'` não existe, **pare e pergunte**: isso revisa D-55 e é decisão do dono.
- **`PROGRESS.md`** — F5-S07 ✅, **blindagem concluída**, próximo = F5-S08. Duas pendências
  obrigatórias:
  1. _"Produção restrita a **réplica única** enquanto `RATE_LIMIT_REDIS_URL` não existir (D-55).
     F5-S08 fixa `replicas: 1` no `railway.json` e registra no runbook."_
  2. _"`TRUSTED_PROXIES` com o CIDR real da borda da Railway — F5-S08 (D-50)."_
- **`F5-S07.md`** — (a) o que a §5.1 encontrou e a forma exata da tabela gerada pelo CLI; (b) por
  que a ordem do `buildApp()` **não** mudou, com as duas razões — a próxima sessão vai querer
  "consertar" isso e precisa encontrar a resposta aqui; (c) como ligar o Redis no dia em que a
  segunda réplica for necessária, passo a passo; (d) a conferência da §5.6, com a tabela dos 27
  GAPs e o sprint que entregou cada um.

---

## 10. Depois deste sprint

**Os 27 GAPs da auditoria estão corrigidos.** O projeto pode ir a produção sem achado aberto — o
que era a condição de D-49 para o deploy acontecer.

Próximo: **F5-S08**, deploy na Railway, que herda duas restrições operacionais deste sprint
(réplica única e `TRUSTED_PROXIES` real). Depois, **F5-S09** fecha a `v1.0.0` com a auditoria da
spec `08` §9 — e é lá que se confirma, com evidência, que nada regrediu no caminho.
