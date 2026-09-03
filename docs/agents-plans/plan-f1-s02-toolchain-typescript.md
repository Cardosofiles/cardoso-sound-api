# Plano de Implementação — F1-S02: Toolchain TypeScript e Qualidade

| Item           | Detalhe                                                           |
| -------------- | ----------------------------------------------------------------- |
| **Fase**       | F1 — Fundação                                                     |
| **Sprint**     | `F1-S02`                                                          |
| **Branch**     | `feature/f1s02-toolchain-typescript`                              |
| **Base**       | `develop`                                                         |
| **Depende de** | F1-S01                                                            |
| **Entrega**    | `typecheck`, `lint`, `format`, `test` e `build` executam e passam |

---

## 1. Contexto e Objetivos

O objetivo deste sprint é fazer os **cinco portões de qualidade existirem e passarem**:

1. `pnpm typecheck` (`tsc --noEmit` — zero erros).
2. `pnpm lint` (`eslint .` — zero erros).
3. `pnpm format` (`prettier . --write`).
4. `pnpm test` (`vitest run` — 6 testes verdes).
5. `pnpm build` (`tsup` — geração de `dist/`).

Atualmente, os arquivos de configuração (`tsconfig.json`, `eslint.config.mjs`, `tsup.config.ts`, `vitest.config.ts`, `vitest.workspace.ts`) possuem 0 bytes. Além disso, o `package.json` possui dependências órfãs e versões desatualizadas de acordo com a decisão **D-04**.

Para validar a suíte sem recorrer ao artifício proibido de `--passWithNoTests`, implementaremos o utilitário real `src/shared/utils/pagination.ts` (exigido por D-14) acompanhado de sua suíte completa cobrindo os casos obrigatórios T1 a T6.

---

## 2. Blast Radius e Fronteiras de Arquivos

### Arquivos a preencher (hoje com 0 bytes):

- [`tsconfig.json`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tsconfig.json)
- [`eslint.config.mjs`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/eslint.config.mjs)
- [`tsup.config.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tsup.config.ts)
- [`vitest.config.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/vitest.config.ts)
- [`vitest.workspace.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/vitest.workspace.ts)

### Arquivos a criar:

- [`src/shared/utils/pagination.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/src/shared/utils/pagination.ts)
- [`tests/unit/shared/pagination.test.ts`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/tests/unit/shared/pagination.test.ts)

### Arquivos a editar:

- [`package.json`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/package.json) (higiene de dependências D-04 e engines)
- [`.agents/memory/PROGRESS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/PROGRESS.md)
- [`.agents/memory/DECISIONS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (registros D-34, D-35, D-36)
- [`.agents/memory/F1-S02.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/F1-S02.md) (resumo da entrega do sprint)

### Exceção prevista de entries vazios no tsup:

- Caso o `tsup` rejeite arquivos de entrada com 0 bytes (`src/server.ts`, `src/jobs/runner.ts`, `src/db/migrate.ts`), será adicionado temporariamente `export {};` com comentário explícito conforme previsto nas seções 5.5 e 8 do documento de sprint.

### Documentos de planejamento e artefatos:

- [`docs/agents-plans/plan-f1-s02-toolchain-typescript.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/plan-f1-s02-toolchain-typescript.md)

### Arquivos estritamente intocados (fora do blast radius):

- Qualquer outro arquivo em `src/**`
- `.github/**`
- `Dockerfile` e `docker-compose.yml`
- `drizzle.config.ts`
- `.env*`
- `pnpm-workspace.yaml`

---

## 3. Contratos Técnicos

### 3.1 `src/shared/utils/pagination.ts`

```ts
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function toOffset(input: { page: number; limit: number }): number {
  return (input.page - 1) * input.limit;
}

export function buildPaginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(input.total / input.limit));
  const hasNext = input.page < totalPages;
  const hasPrev = input.page > 1;

  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages,
    hasNext,
    hasPrev,
  };
}
```

### 3.2 `tsconfig.json`

- Target e Lib: `ES2023`
- Module e ModuleResolution: `NodeNext`
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`
- `exactOptionalPropertyTypes: false` (justificado: compatibilidade com `fastify-type-provider-zod`)
- `verbatimModuleSyntax: true` (exige `import type`)
- `esModuleInterop: true`
- `skipLibCheck: true`
- `resolveJsonModule: true`
- `forceConsistentCasingInFileNames: true`
- `declaration: false`
- `sourceMap: true`
- `noEmit: true`
- Includes: `["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.mts"]`
- Excludes: `["node_modules", "dist"]`

### 3.3 `eslint.config.mjs`

- ESLint 9 Flat Config integrando:
  - `@eslint/js` recommended
  - `typescript-eslint` (`tseslint.configs.strictTypeChecked`) com `parserOptions.projectService: true` e `tsconfigRootDir: import.meta.dirname`
  - `eslint-plugin-boundaries` configurado com `boundaries/elements` para as camadas da Clean Architecture (`routes`, `service`, `repository`, `dto`, `plugin`, `db`, `shared`, `config`, `app`, `server`, `jobs`) e regras de isolamento estrito
  - `eslint-import-resolver-typescript`
- Regras obrigatórias:
  - `@typescript-eslint/no-explicit-any: error`
  - `@typescript-eslint/no-floating-promises: error`
  - `@typescript-eslint/consistent-type-imports: error`
  - `no-console: error` em `src/**`
  - `boundaries/element-types: error` (com política `default: 'disallow'`)
  - `no-restricted-syntax: error` para `process.env` em `src/**` (com override desligando para `src/config/env.ts`)
  - Override para `tests/**`: `no-console: off`, regras de boundaries desabilitadas

### 3.4 `vitest.config.ts` e `vitest.workspace.ts`

- `vitest.config.ts`:
  - `globals: false` (imports explícitos de `vitest`)
  - `environment: 'node'`
  - `include: ['tests/**/*.test.ts']`
  - `testTimeout: 15_000`
  - `hookTimeout: 120_000`
  - `pool: 'forks'`, `poolOptions: { forks: { singleFork: true } }`
  - `reporters: ['default']`
- `vitest.workspace.ts`:
  - `defineWorkspace` com 3 projetos nomeados: `unit` (`tests/unit/**/*.test.ts`), `integration` (`tests/integration/**/*.test.ts`), `e2e` (`tests/e2e/**/*.test.ts`).

### 3.5 `tsup.config.ts`

- `entry: ['src/server.ts', 'src/db/migrate.ts', 'src/jobs/runner.ts']`
- `format: ['esm']`
- `target: 'node24'`
- `outDir: 'dist'`
- `clean: true`
- `sourcemap: true`
- `splitting: false`
- `bundle: false` (preserva estrutura de arquivos e resolução de imports `.js`)

---

## 4. Casos de Teste Obrigatórios (`tests/unit/shared/pagination.test.ts`)

| #   | Caso de Teste                                            | Asserção Esperada                               |
| --- | -------------------------------------------------------- | ----------------------------------------------- |
| T1  | `toOffset({ page: 1, limit: 20 })`                       | `0`                                             |
| T2  | `toOffset({ page: 3, limit: 20 })`                       | `40`                                            |
| T3  | `buildPaginationMeta({ page: 1, limit: 20, total: 40 })` | `totalPages: 2, hasNext: true, hasPrev: false`  |
| T4  | `buildPaginationMeta({ page: 2, limit: 20, total: 40 })` | `hasNext: false, hasPrev: true`                 |
| T5  | `total: 0`                                               | `totalPages: 1, hasNext: false, hasPrev: false` |
| T6  | `total: 41, limit: 20`                                   | `totalPages: 3` (arredondamento para cima)      |

---

## 5. Plano de Execução Passo a Passo

### Etapa 1: Git Branch

- Criação e checkout da branch `feature/f1s02-toolchain-typescript` a partir de `develop`.

### Etapa 2: Higiene de Dependências (D-04)

- Atualização e remoção conforme D-04:
  - `fastify@^5.8.5`
  - `better-auth@^1.7.2`
  - `@types/node@^24`
  - Remoção de `@neondatabase/serverless`, `uuid`, `@types/ws`
  - Adição de `"engines": { "node": ">=24.0.0" }` em `package.json`
- Validação com `pnpm ls` e `git status`.

### Etapa 3: Configurações de Toolchain

- Preenchimento de `tsconfig.json`.
- Preenchimento de `eslint.config.mjs`.
- Preenchimento de `tsup.config.ts`.
- Preenchimento de `vitest.config.ts`.
- Preenchimento de `vitest.workspace.ts`.

### Etapa 4: Implementação do Utilitário e Testes

- Criação de `src/shared/utils/pagination.ts`.
- Criação de `tests/unit/shared/pagination.test.ts` cobrindo T1 a T6.
- Caso necessário pelo `tsup`, adição de `export {};` nos entry points vazios (`src/server.ts`, `src/jobs/runner.ts`, `src/db/migrate.ts`).

### Etapa 5: Validação Rigorosa dos 5 Portões

1. `pnpm typecheck` (`tsc --noEmit` — 0 erros)
2. `pnpm lint` (`eslint .` — 0 erros)
3. `pnpm format` (`prettier . --write`)
4. `pnpm test` (`vitest run` — 6 testes passando)
5. `pnpm build` (`tsup` — dist gerado)

### Etapa 6: Registro de Memória

- Atualização de `.agents/memory/DECISIONS.md`:
  - `D-34`: `exactOptionalPropertyTypes: false`
  - `D-35`: `bundle: false` no tsup
  - `D-36`: `singleFork: true` no Vitest
- Criação de `.agents/memory/F1-S02.md` baseado no template.
- Atualização de `.agents/memory/PROGRESS.md` (F1-S02 concluído, próximo F1-S03).

### Etapa 7: Entrega Git Flow (Pull Request)

- `git add -A`
- Commit convencional: `feat(toolchain): configura tsconfig, eslint, vitest, tsup e utilitario pagination`
- `git push -u origin feature/f1s02-toolchain-typescript`
- Abertura de PR via `gh pr create --base develop` reportando o estado do sprint e que o CI formal será construído no sprint F1-S04.
- Sessão encerrada aguardando revisão do mantenedor (sem auto-merge, sem iniciar F1-S03).

---

## 6. O Que NÃO Será Feito Neste Sprint

- Nenhuma migração Drizzle ou banco de dados (F2-S01).
- Nenhum setup de Docker / variáveis `.env` (F1-S03).
- Nenhum workflow GitHub Actions (F1-S04).
- Nenhuma rota Fastify ou plugin de servidor (F1-S05/F1-S06).
- Nenhuma alteração em `pnpm-workspace.yaml`.
