# F1-S03 — Ambiente: Docker, Env e Constantes

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Fase**       | F1 — Fundação                                                                    |
| **Branch**     | `feature/f1s03-ambiente-docker-e-config`                                         |
| **Depende de** | F1-S02                                                                           |
| **Entrega**    | Postgres 17 sobe local, `env.ts` valida a configuração, constantes centralizadas |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S03-ambiente-docker-e-config.md
Specs obrigatórias: docs/specs/04-autenticacao-e-seguranca.md (§6),
                    docs/specs/06-git-ci-cd-e-deploy.md (§7)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Dar ao projeto um **ambiente reproduzível**: Postgres 17 em container com healthcheck,
variáveis de ambiente validadas por Zod que derrubam o processo se estiverem erradas, e
as constantes de negócio num único lugar.

Resolve o bloqueio **B2** (`.env` vazio, sem `DATABASE_URL`).

---

## 3. Contratos esperados

### `src/config/env.ts`

```ts
export const env: {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  CORS_ORIGIN_LIST: string[]; // derivado: split(',').map(trim).filter(Boolean)
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW: string;
};
export const isProduction: boolean;
export const isTest: boolean;
export const isDevelopment: boolean;
```

Tabela completa de variáveis, tipos e defaults: **spec `04` §6**.

Comportamento em falha: imprimir as issues do Zod de forma legível (`z.treeifyError` ou
`error.issues.map(...)`) e `process.exit(1)`. **Não** lançar exceção — o processo não deve
subir pela metade.

### `src/config/constants.ts`

```ts
export const APP_NAME = 'cardoso-sound-api';
export const API_PREFIX = '/api/v1';
export const AUTH_PREFIX = '/api/auth';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_PLAYLISTS_PER_USER = 50;
export const MAX_TRACKS_PER_PLAYLIST = 500;

export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 8;
export const SHUTDOWN_TIMEOUT_MS = 10_000;
```

> `DEFAULT_PAGE_SIZE` e `MAX_PAGE_SIZE` já existem em `pagination.ts` (F1-S02).
> **Reexporte a partir dele** — não duplique o valor. `pagination.ts` é a origem.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
docker-compose.yml
.env
.env.example
```

### Criar

```
src/config/env.ts
src/config/constants.ts
tests/unit/config/env.test.ts
```

### Editar

```
src/shared/utils/pagination.ts    # só se precisar ajustar o export das constantes
.agents/memory/PROGRESS.md
.agents/memory/F1-S03.md
```

**Não toque em:** `Dockerfile` e `railway.json` (são F5-S02) · `drizzle.config.ts` (F2-S01)
· qualquer `src/db/**`, `src/modules/**`, `src/plugins/**`.

---

## 5. Passo a passo

### 5.1 `docker-compose.yml`

Conteúdo normativo na **spec `06` §7**. Confira: imagem `postgres:17-alpine`, volume
nomeado `pgdata`, healthcheck com `pg_isready`, porta `5432:5432`.

```bash
docker compose up -d
docker compose ps        # deve mostrar (healthy)
```

### 5.2 `.env` e `.env.example`

`.env.example` é **commitado**, documentado e sem valor real:

```dotenv
# Ambiente: development | test | production
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Postgres local (docker compose up -d)
DATABASE_URL=postgresql://cardoso:cardoso_dev@localhost:5432/cardoso_sound

# Better Auth — gere com: openssl rand -base64 32
BETTER_AUTH_SECRET=troque-por-um-segredo-de-no-minimo-32-caracteres
BETTER_AUTH_URL=http://localhost:3000

# CSV de origens permitidas. Ignorado fora de produção (D-19).
CORS_ORIGIN=http://localhost:3000

LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
```

`.env` é o mesmo arquivo com valores locais reais. **Está no `.gitignore`** (F1-S01) —
confirme com `git check-ignore -v .env` antes de commitar qualquer coisa.

### 5.3 `env.ts`

- `dotenv/config` importado **no topo**, antes do parse. Em produção a Railway injeta as
  variáveis direto e o `.env` não existe — `dotenv` lidando com arquivo ausente é normal,
  não trate como erro.
- Zod 4: use `z.coerce.number().int().positive()` para `PORT` e `RATE_LIMIT_MAX`;
  `z.url()` para as URLs; `z.enum([...])` com `.default(...)` para os enums.
- `CORS_ORIGIN_LIST` é derivado no mesmo módulo, não em outro lugar.
- **Este é o único arquivo do projeto autorizado a ler `process.env`** — a regra de lint
  de F1-S02 garante isso.

Para tornar o módulo testável sem mexer no `process.env` global, exporte também a função
pura de parse:

```ts
export function parseEnv(source: NodeJS.ProcessEnv): Env; // usada pelos testes
export const env = loadEnv(); // usada pela aplicação
```

### 5.4 `constants.ts`

Conforme §3. Nada de valor mágico espalhado pelo código a partir daqui.

---

## 6. Casos de teste obrigatórios

`tests/unit/config/env.test.ts` — testa `parseEnv`, nunca o `process.env` real.

| #   | Caso                                                             | Esperado                                 |
| --- | ---------------------------------------------------------------- | ---------------------------------------- |
| T1  | Env mínimo válido (`DATABASE_URL` + `BETTER_AUTH_SECRET` de 32+) | parseia; defaults aplicados              |
| T2  | `DATABASE_URL` ausente                                           | lança / falha a validação                |
| T3  | `DATABASE_URL` não é URL                                         | falha                                    |
| T4  | `BETTER_AUTH_SECRET` com 10 chars                                | falha                                    |
| T5  | `PORT="3000"` (string)                                           | vira `number` 3000                       |
| T6  | `NODE_ENV` fora do enum                                          | falha                                    |
| T7  | `CORS_ORIGIN="a.com, b.com ,"`                                   | `CORS_ORIGIN_LIST === ['a.com','b.com']` |
| T8  | `CORS_ORIGIN=""`                                                 | `CORS_ORIGIN_LIST === []`                |
| T9  | `LOG_LEVEL` ausente                                              | default `'info'`                         |

---

## 7. Definition of Done

```bash
docker compose up -d && docker compose ps      # (healthy)
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
```

- [ ] T1–T9 verdes
- [ ] `docker compose ps` mostra `(healthy)`
- [ ] `psql "$DATABASE_URL" -c 'select 1'` (ou `docker compose exec postgres psql -U cardoso -d cardoso_sound -c 'select 1'`) responde
- [ ] `.env.example` commitado e completo; `.env` **não** aparece em `git status`
- [ ] Nenhum `process.env` fora de `src/config/env.ts` (o lint prova)
- [ ] PR aberto para `develop`; memória atualizada

---

## 8. Armadilhas conhecidas

1. **`z.string().url()` foi substituído** por `z.url()` no Zod 4. A forma antiga emite
   deprecação. Escreva Zod 4 (D-01).
2. **`process.exit(1)` dentro de `env.ts` quebra a suíte** se o módulo for importado
   com env inválido em teste. Por isso `parseEnv` é exportada separada: o teste chama a
   função pura, nunca o `loadEnv()` com side effect.
3. **`dotenv` não sobrescreve variável já definida** no ambiente. Em CI e na Railway isso
   é o comportamento desejado — não force `override: true`.
4. **A porta 5432 pode já estar ocupada** por um Postgres do sistema. Se `docker compose up`
   falhar com "port is already allocated", **pare e reporte** — mudar a porta é decisão do
   usuário, não do agente.
5. **Valores com espaço no `.env`** (`RATE_LIMIT_WINDOW=1 minute`) funcionam sem aspas no
   dotenv, mas confirme que o parse preserva o valor inteiro.
6. **Não gere um `BETTER_AUTH_SECRET` real e commite.** No `.env.example` vai o placeholder;
   no `.env` local, um valor gerado por `openssl rand -base64 32`.

---

## 9. Registro na memória

- **`PROGRESS.md`** — F1-S03 ✅, próximo = F1-S04, remover bloqueio **B2**.
- **`F1-S03.md`** — a lista final de variáveis e a `DATABASE_URL` local (sem senha real
  se ela tiver sido personalizada).
