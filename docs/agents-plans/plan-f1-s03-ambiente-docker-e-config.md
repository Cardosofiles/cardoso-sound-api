# Plano de Implementação — Sprint F1-S03: Ambiente: Docker, Env e Constantes

> **Status:** ✅ Concluído (Etapas 6 e 7 do Protocolo)  
> **Fase:** F1 — Fundação  
> **Branch Alvo:** `feature/f1s03-ambiente-docker-e-config` (a partir de `develop`)  
> **Specs de Referência:** `docs/specs/04-autenticacao-e-seguranca.md` (§6), `docs/specs/06-git-ci-cd-e-deploy.md` (§7), `docs/specs/07-protocolo-dos-agentes.md`

---

## 1. Contexto e Diagnóstico Inicial

A sprint F1-S03 estabelece o ambiente reproduzível da API:

1. **Container PostgreSQL 17** via Docker Compose com healthcheck nativo `pg_isready`.
2. **Validação estrita de variáveis de ambiente** via Zod 4 em `src/config/env.ts`, derrubando o processo com `process.exit(1)` caso a configuração seja inválida, e expondo função pura `parseEnv` para testabilidade.
3. **Centralização de constantes de negócio e domínio** em `src/config/constants.ts`, reexportando a paginação definida em `src/shared/utils/pagination.ts`.
4. **Resolução do Bloqueio B2** (`.env` vazio, sem `DATABASE_URL`).

### ⚠️ Alerta Crítico Detectado: Conflito na Porta 5432

Durante a inspeção preliminar do host, foi detectado que a porta `5432` já está alocada por um container em execução:

- **Container existente:** `sportswear-db` (`postgres:16-alpine`), escutando em `0.0.0.0:5432`.
- **Diretriz da Sprint (Armadilha 4):** _"A porta 5432 pode já estar ocupada por um Postgres do sistema. Se `docker compose up` falhar com 'port is already allocated', pare e reporte — mudar a porta é decisão do usuário, não do agente."_
- **Recomendação:** Para manter aderência estrita à spec sem alterar contratos de porta, pausar/parar o container concorrente antes de subir o Postgres da sprint:
  ```bash
  docker stop sportswear-db
  ```

---

## 2. Blast Radius e Controle de Arquivos

Em conformidade rigorosa com a seção 4 da sprint:

### Preencher (atualmente com 0 bytes):

- `docker-compose.yml`: Definição oficial do serviço PostgreSQL 17 Alpine com volume e healthcheck.
- `.env.example`: Template documentado, commitado, sem valores sensíveis de produção.
- `.env`: Configuração local real (ignorado pelo Git via `.gitignore:4:.env`).

### Criar:

- `src/config/env.ts`: Módulo de validação Zod 4, único autorizado a ler `process.env`.
- `src/config/constants.ts`: Constantes globais e de domínio da aplicação.
- `tests/unit/config/env.test.ts`: Suíte de testes unitários para `parseEnv` cobrindo T1 a T9.
- `docs/agents-plans/plan-f1-s03-ambiente-docker-e-config.md`: Registro do plano (Regra 6).

### Editar:

- `src/shared/utils/pagination.ts`: Manter compatibilidade com exports de `DEFAULT_PAGE_SIZE` e `MAX_PAGE_SIZE`.
- `.agents/memory/PROGRESS.md`: Atualizar status para F1-S03 concluído e remover bloqueio B2.
- `.agents/memory/F1-S03.md`: Criar resumo do sprint a partir de `_TEMPLATE.md`.

### Arquivos Intocáveis nesta Sprint:

- `Dockerfile` e `railway.json` (escopo de F5-S02).
- `drizzle.config.ts` (escopo de F2-S01).
- Qualquer arquivo em `src/db/**`, `src/modules/**`, `src/plugins/**`.

---

## 3. Especificação Técnica dos Contratos

### 3.1 `docker-compose.yml`

Configuração normativa de `docs/specs/06-git-ci-cd-e-deploy.md` (§7):

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cardoso
      POSTGRES_PASSWORD: cardoso_dev
      POSTGRES_DB: cardoso_sound
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cardoso -d cardoso_sound']
      interval: 5s
      timeout: 5s
      retries: 10
volumes: { pgdata }
```

### 3.2 `.env.example` e `.env`

Variáveis padronizadas:

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

Para o `.env` local, será injetado um segredo real gerado com `openssl rand -base64 32` (≥ 32 caracteres).

### 3.3 `src/config/env.ts`

- **Importação:** `import 'dotenv/config';` no topo.
- **Validação com Zod 4:**
  - `NODE_ENV`: `z.enum(['development', 'test', 'production']).default('development')`
  - `PORT`: `z.coerce.number().int().positive().default(3000)`
  - `HOST`: `z.string().default('0.0.0.0')`
  - `DATABASE_URL`: `z.url()` (obrigatória, sem default)
  - `BETTER_AUTH_SECRET`: `z.string().min(32)` (obrigatória, sem default)
  - `BETTER_AUTH_URL`: `z.url().default('http://localhost:3000')`
  - `CORS_ORIGIN`: `z.string().default('')`
  - `LOG_LEVEL`: `z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')`
  - `RATE_LIMIT_MAX`: `z.coerce.number().int().positive().default(100)`
  - `RATE_LIMIT_WINDOW`: `z.string().default('1 minute')`
- **Valores derivados:**
  - `CORS_ORIGIN_LIST`: `source.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)`
  - `isProduction`: `env.NODE_ENV === 'production'`
  - `isTest`: `env.NODE_ENV === 'test'`
  - `isDevelopment`: `env.NODE_ENV === 'development'`
- **Assinaturas exportadas:**
  ```ts
  export function parseEnv(source: NodeJS.ProcessEnv): Env;
  export const env: Env;
  export const isProduction: boolean;
  export const isTest: boolean;
  export const isDevelopment: boolean;
  ```
- **Tratamento de erro em `loadEnv`:** Formatação via `process.stderr.write` e encerramento com `process.exit(1)` imediato sem lançar exceção solta para o runtime do Fastify.

### 3.4 `src/config/constants.ts`

Contrato centralizado:

```ts
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../shared/utils/pagination.js';

export const APP_NAME = 'cardoso-sound-api';
export const API_PREFIX = '/api/v1';
export const AUTH_PREFIX = '/api/auth';

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

export const MAX_PLAYLISTS_PER_USER = 50;
export const MAX_TRACKS_PER_PLAYLIST = 500;

export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 8;
export const SHUTDOWN_TIMEOUT_MS = 10_000;
```

---

## 4. Matriz de Casos de Teste (`tests/unit/config/env.test.ts`)

| ID     | Cenário                          | Entrada                                           | Resultado Esperado                        |
| ------ | -------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| **T1** | Env mínimo válido                | `DATABASE_URL` + `BETTER_AUTH_SECRET` (≥32 chars) | Parseia com sucesso; defaults aplicados   |
| **T2** | `DATABASE_URL` ausente           | Sem `DATABASE_URL`                                | Lança erro de validação Zod               |
| **T3** | `DATABASE_URL` inválida          | `DATABASE_URL="invalido"`                         | Lança erro Zod (url inválida)             |
| **T4** | `BETTER_AUTH_SECRET` curto       | `BETTER_AUTH_SECRET="1234567890"` (10 chars)      | Lança erro Zod (min 32)                   |
| **T5** | Coerção de porta numérica        | `PORT="3000"` (string)                            | Coagido para `number` 3000                |
| **T6** | `NODE_ENV` inválido              | `NODE_ENV="staging"`                              | Lança erro Zod (enum inválido)            |
| **T7** | CSV com espaços e trailing comma | `CORS_ORIGIN="a.com, b.com ,"`                    | `CORS_ORIGIN_LIST === ['a.com', 'b.com']` |
| **T8** | CSV vazio                        | `CORS_ORIGIN=""`                                  | `CORS_ORIGIN_LIST === []`                 |
| **T9** | `LOG_LEVEL` omitido              | Sem `LOG_LEVEL` informado                         | Aplica default `'info'`                   |

---

## 5. Roteiro Passo a Passo de Execução

1. **Criação da Branch:**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/f1s03-ambiente-docker-e-config
   ```

2. **Resolução da Porta 5432 & Inicialização do Postgres:**
   - Confirmar ação de resolução da porta (parar `sportswear-db` via `docker stop sportswear-db`).
   - Preencher `docker-compose.yml`.
   - Executar `docker compose up -d` e validar status `(healthy)`.
   - Testar conexão com o banco: `docker compose exec postgres psql -U cardoso -d cardoso_sound -c 'select 1'`.

3. **Geração dos Arquivos de Ambiente:**
   - Preencher `.env.example`.
   - Preencher `.env` local com chave de 32 bytes gerada via openssl.
   - Confirmar isolamento do git com `git check-ignore -v .env`.

4. **Implementação de Código:**
   - Implementar `src/config/constants.ts` (reexportando de `pagination.js`).
   - Implementar `src/config/env.ts` (Zod 4, dotenv, tipagem, parseEnv e loadEnv).

5. **Implementação dos Testes:**
   - Criar `tests/unit/config/env.test.ts` cobrindo casos T1 a T9.
   - Executar `pnpm test` e garantir passagem integral.

6. **Validação dos 5 Portões de Qualidade:**

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format
   pnpm test
   pnpm build
   ```

7. **Entrega e Registro de Memória (Etapas 6 e 7):**
   - Atualizar `.agents/memory/PROGRESS.md` (remover B2, marcar F1-S03 como concluído).
   - Criar `.agents/memory/F1-S03.md`.
   - Commit semântico: `feat(config): configura ambiente docker, validacao de env e constantes`
   - Push para origin e criação do Pull Request apontando para `develop`.
   - Monitorar CI com `gh run watch --exit-status` (se acionado) e relatar ao usuário.

---

## 6. Definition of Done (DoD)

- [x] `docker compose ps` reporta status `(healthy)`
- [x] Query de teste `SELECT 1` executada com sucesso no container Postgres 17
- [x] Testes unitários T1 a T9 verdes em `tests/unit/config/env.test.ts`
- [x] `.env.example` commitado; `.env` ignorado pelo Git (`git status` limpo quanto a ele)
- [x] Zero acessos a `process.env` fora de `src/config/env.ts` (validado pelo ESLint)
- [x] Todos os 5 portões de qualidade passando sem avisos ou erros
- [x] PR criado no GitHub apontando para `develop` (#5) com memória sincronizada
