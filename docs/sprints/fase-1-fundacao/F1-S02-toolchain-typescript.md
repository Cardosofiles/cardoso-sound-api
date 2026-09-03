# F1-S02 — Toolchain TypeScript e Qualidade

|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| **Fase**       | F1 — Fundação                                                     |
| **Branch**     | `feature/f1s02-toolchain-typescript`                              |
| **Depende de** | F1-S01                                                            |
| **Entrega**    | `typecheck`, `lint`, `format`, `test` e `build` executam e passam |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S02-toolchain-typescript.md
Specs obrigatórias: docs/specs/01-arquitetura.md, docs/specs/05-testes-e-qualidade.md

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fazer os cinco portões de qualidade **existirem e passarem**. Hoje `tsconfig.json`,
`eslint.config.mjs`, `tsup.config.ts`, `vitest.config.ts` e `vitest.workspace.ts` têm
0 bytes, então todo comando do `package.json` falha.

Inclui a higiene de dependências de **D-04**: subir `fastify` e `better-auth`, remover as
dependências órfãs.

Para provar que a suíte roda, o sprint cria **um** utilitário real com teste real:
`src/shared/utils/pagination.ts`. Ele é necessário de qualquer forma (D-14) e evita a
gambiarra de `--passWithNoTests`.

---

## 3. Contratos esperados

### `src/shared/utils/pagination.ts`

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

export function toOffset(input: { page: number; limit: number }): number;
export function buildPaginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta;
```

Regras: `totalPages = Math.max(1, Math.ceil(total / limit))` · `hasNext = page < totalPages`
· `hasPrev = page > 1` · `total === 0` → `totalPages === 1`, `hasNext === false`.

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
tsconfig.json
eslint.config.mjs
tsup.config.ts
vitest.config.ts
vitest.workspace.ts
```

### Criar

```
src/shared/utils/pagination.ts
tests/unit/shared/pagination.test.ts
```

### Editar

```
package.json                    # apenas dependências e engines — D-04
.agents/memory/PROGRESS.md
.agents/memory/F1-S02.md
```

**Não toque em:** qualquer outro `src/**`, `.github/**`, `Dockerfile`, `docker-compose.yml`,
`drizzle.config.ts`, `.env*`.

---

## 5. Passo a passo

### 5.1 Dependências (D-04)

Estado verificado em 2026-09-03: `ws` **já foi removido**; `@neondatabase/serverless`,
`uuid` e `@types/ws` **ainda estão** no `package.json`.

```bash
pnpm add fastify@^5.8.5 better-auth@^1.7.2
pnpm remove @neondatabase/serverless uuid @types/ws
pnpm add -D @types/node@^24
```

Acrescente ao `package.json`:

```json
"engines": { "node": ">=24.0.0" }
```

> Confirme o estado final com `grep`, não o sucesso do comando — `pnpm remove` de pacote
> ausente sai com erro e aborta a linha inteira.
>
> **Não mexa em `pnpm-workspace.yaml`.** O `allowBuilds` já está decidido (D-32) e
> `pnpm install` passa. Se um pacote novo trouxer script de build, aí sim: decida
> explicitamente, **nunca** com `pnpm approve-builds --all`.

### 5.2 `tsconfig.json`

Alvo ESM/NodeNext estrito:

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true,
    "noEmit": true,
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.mts"],
  "exclude": ["node_modules", "dist"],
}
```

> `exactOptionalPropertyTypes` fica **desligado**: ligado, ele briga com o
> `fastify-type-provider-zod` e com opções opcionais dos plugins Fastify, gerando ruído
> sem ganho real. Registre isso no `F1-S02.md`.
>
> `verbatimModuleSyntax` **exige** `import type { … }` para tipos. É intencional.

### 5.3 `eslint.config.mjs` (flat config, ESLint 9)

Composição: `@eslint/js` recommended + `typescript-eslint` strictTypeChecked +
`eslint-plugin-boundaries` + `eslint-import-resolver-typescript`.

Regras que **precisam** existir:

| Regra                                        | Nível                               | Por quê                    |
| -------------------------------------------- | ----------------------------------- | -------------------------- |
| `@typescript-eslint/no-explicit-any`         | `error`                             | D-01, regra central        |
| `@typescript-eslint/no-floating-promises`    | `error`                             | promessa solta engole erro |
| `@typescript-eslint/consistent-type-imports` | `error`                             | `verbatimModuleSyntax`     |
| `no-console`                                 | `error` em `src/**`                 | log é do Fastify           |
| `boundaries/element-types`                   | `error`                             | fronteiras da spec `01` §5 |
| `no-restricted-syntax` para `process.env`    | `error` fora de `src/config/env.ts` | spec `04` §6               |

Ignorar: `dist`, `coverage`, `drizzle`, `node_modules`, `.husky`.
`tests/**` tem override: `no-console` off, `boundaries` off.

> `strictTypeChecked` exige `parserOptions.projectService: true`. Sem isso as regras que
> dependem de tipo não rodam e o lint passa dando falsa sensação de segurança.

### 5.4 `vitest.config.ts` e `vitest.workspace.ts`

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    globals: false, // importe describe/it/expect de 'vitest'
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 120_000, // Testcontainers precisa disso em F2-S02
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default'],
  },
});
```

`vitest.workspace.ts` define três projects — `unit` (`tests/unit`), `integration`
(`tests/integration`), `e2e` (`tests/e2e`) — para `--project` funcionar (spec `05` §1).

> `singleFork: true` evita N containers Postgres em paralelo em F2-S02. Custo: suíte
> sequencial. Com este volume de testes, é o trade-off certo.

### 5.5 `tsup.config.ts`

```ts
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts', 'src/jobs/runner.ts'],
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: false, // preserva a árvore de arquivos; imports .js continuam válidos
});
```

> `bundle: false` porque os scripts `db:migrate:deploy` e `jobs` apontam para caminhos
> específicos em `dist/`. `src/jobs/runner.ts` está vazio (D — fora de escopo): se o tsup
> reclamar de entry vazio, escreva nele apenas
> `export {};` com um comentário explicando que nenhum job existe no MVP.

### 5.6 Utilitário e teste

Implemente `pagination.ts` conforme §3 e escreva `tests/unit/shared/pagination.test.ts`
cobrindo T1–T6 da §6.

---

## 6. Casos de teste obrigatórios

| #   | Caso                                                     | Esperado                                        |
| --- | -------------------------------------------------------- | ----------------------------------------------- |
| T1  | `toOffset({ page: 1, limit: 20 })`                       | `0`                                             |
| T2  | `toOffset({ page: 3, limit: 20 })`                       | `40`                                            |
| T3  | `buildPaginationMeta({ page: 1, limit: 20, total: 40 })` | `totalPages: 2, hasNext: true, hasPrev: false`  |
| T4  | `buildPaginationMeta({ page: 2, limit: 20, total: 40 })` | `hasNext: false, hasPrev: true`                 |
| T5  | `total: 0`                                               | `totalPages: 1, hasNext: false, hasPrev: false` |
| T6  | `total: 41, limit: 20`                                   | `totalPages: 3` (arredonda para cima)           |

---

## 7. Definition of Done

```bash
pnpm install
pnpm typecheck   # zero erro
pnpm lint        # zero erro
pnpm format
pnpm test        # 6 testes verdes
pnpm build       # dist/ gerado
```

- [ ] Os 5 comandos passam, nesta ordem
- [ ] T1–T6 verdes
- [ ] `@neondatabase/serverless`, `ws`, `@types/ws`, `uuid` fora do `package.json`
- [ ] `fastify@^5.8.5` e `better-auth@^1.7.2` instalados; `pnpm-lock.yaml` commitado
- [ ] `engines.node >= 24`
- [ ] Nenhum `any` e nenhum `eslint-disable` sem justificativa
- [ ] PR aberto, CI **ainda não existe** (é F1-S04) — informe isso no corpo do PR
- [ ] Memória atualizada

---

## 8. Armadilhas conhecidas

1. **`eslint-plugin-boundaries` com flat config** usa `settings['boundaries/elements']` no
   objeto de config, não `.eslintrc`. A sintaxe mudou na v5 — consulte o **context7**
   antes de escrever, não a memória do modelo.
2. **`strictTypeChecked` sem `projectService`** faz as regras type-aware sumirem
   silenciosamente. O lint passa e não protege nada.
3. **`verbatimModuleSyntax` quebra `import { FastifyPluginAsync }`** — precisa ser
   `import type`. Vai aparecer bastante nos sprints seguintes.
4. **`vitest.workspace.ts` foi depreciado** em versões recentes do Vitest em favor de
   `test.projects`. Este projeto usa **Vitest 2**, onde `workspace` é o correto e o
   arquivo já existe no scaffold. Não migre.
5. **`tsup` com entry vazio falha o build.** `src/server.ts` também está vazio neste
   momento — coloque nele um `export {};` temporário se o build reclamar, e remova em
   F1-S05.
6. **`pnpm remove` de pacote ausente sai com erro.** Verifique com `pnpm ls <pkg>` antes.

---

## 9. Registro na memória

- **`DECISIONS.md`** — registre `exactOptionalPropertyTypes: false`, `bundle: false` e
  `singleFork: true` **apenas se** considerar que afetam sprints futuros (afetam:
  registre os três).
- **`PROGRESS.md`** — F1-S02 ✅, próximo = F1-S03.
- **`F1-S02.md`** — versões finais das dependências e o conteúdo do bloco `boundaries`.
