# F1-S01 — Repositório e Git Flow

|                                |                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| **Fase**                       | F1 — Fundação                                                                            |
| **Branch**                     | `feature/f1s01-repositorio-e-gitflow`                                                    |
| **Depende de**                 | nada — é o primeiro sprint                                                               |
| **Entrega**                    | Repositório público criado, Git Flow ativo, hooks funcionando, documentação reconciliada |
| **Escreve código TypeScript?** | Não                                                                                      |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S01-repositorio-e-gitflow.md
Specs obrigatórias: docs/specs/00-visao-geral.md, docs/specs/06-git-ci-cd-e-deploy.md,
                    docs/specs/07-protocolo-dos-agentes.md

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Transformar uma pasta solta em um repositório versionado, público, com Git Flow ativo,
hooks de qualidade funcionando e **documentação que não se contradiz**.

Este sprint existe porque hoje: (a) não é repositório git; (b) `.gitignore`,
`.gitattributes`, `.husky/*` e `commitlint.config.mjs` estão **vazios**; (c) `README.md` e
`AGENTS.md` afirmam coisas que as decisões D-01, D-03, D-09, D-10 e D-16 revogaram.

**Pré-requisito humano (B1):** `gh` precisa estar instalado e autenticado. Se
`gh auth status` falhar, **pare** e peça ao usuário para rodar `gh auth login`.

---

## 3. Contratos esperados

Nenhum contrato HTTP. Os "contratos" deste sprint são o estado do repositório:

| Verificação                    | Comando                                                          | Esperado                       |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------ |
| Repositório existe e é público | `gh repo view --json visibility -q .visibility`                  | `PUBLIC`                       |
| Branch padrão                  | `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` | `develop`                      |
| Branches remotas               | `git ls-remote --heads origin`                                   | `main` e `develop`             |
| Hook de commit funciona        | `git commit -m "mensagem invalida"`                              | **rejeitado** por commitlint   |
| `.env` ignorado                | `git check-ignore -v .env`                                       | casa com regra do `.gitignore` |
| `.env` fora do histórico       | `git log --all --name-only \| grep -c '^\.env$'`                 | `0`                            |

---

## 4. Blast radius

**Só estes arquivos.** Precisar de outro → parar e perguntar.

### Criar

```
.nvmrc
.husky/pre-commit
.husky/commit-msg
.lintstagedrc.json          ← nome CORRETO, com ponto (ver §8)
```

### Preencher (hoje com 0 bytes)

```
.gitignore
.gitattributes
.dockerignore
.prettierrc.json
.prettierignore
commitlint.config.mjs
```

### Editar (reconciliação documental — D-04c)

```
README.md
AGENTS.md
.agents/rules/testing.md
.agents/skills/test-runner/SKILL.md
.agents/mcp_config.json
```

### Remover

```
lintstagedrc.json           ← sem ponto: lint-staged NUNCA lê este arquivo
```

### Memória

```
.agents/memory/PROGRESS.md
.agents/memory/F1-S01.md
```

**Não toque em:** nada dentro de `src/`, `tests/`, `docs/specs/`, `docs/sprints/`,
`package.json`, `tsconfig.json`, `eslint.config.mjs` — todos são de outros sprints.

---

## 5. Passo a passo

### 5.1 Arquivos de repositório

**`.gitignore`** — no mínimo: `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*.local`,
`*.log`, `.DS_Store`, `.idea/`, `.vitest-cache/`.
**Mantenha `.env.example` versionado** (`!.env.example`).

**`.gitattributes`** — `* text=auto eol=lf` e `pnpm-lock.yaml -diff linguist-generated`.

**`.dockerignore`** — `node_modules`, `dist`, `.git`, `tests`, `docs`, `.agents`,
`coverage`, `*.md`, `.env*`.

**`.nvmrc`** — `24` (D-01).

**`.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

**`.prettierignore`** — `node_modules`, `dist`, `coverage`, `pnpm-lock.yaml`, `drizzle`.

**`commitlint.config.mjs`**

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'chore', 'docs', 'ci', 'perf', 'style', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'setup',
        'config',
        'db',
        'auth',
        'tracks',
        'artists',
        'playlists',
        'favorites',
        'users',
        'health',
        'plugins',
        'tests',
        'ci',
        'deploy',
        'docs',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
```

**`.lintstagedrc.json`**

```json
{ "*.{ts,mts}": ["eslint --fix", "prettier --write"], "*.{json,md,yml,yaml}": ["prettier --write"] }
```

### 5.2 Hooks

```bash
pnpm prepare                                   # instala o husky
printf '%s\n' 'pnpm lint-staged'    > .husky/pre-commit
printf '%s\n' 'pnpm commitlint --edit "$1"' > .husky/commit-msg
chmod +x .husky/pre-commit .husky/commit-msg
```

> Husky 9 dispensa o cabeçalho `#!/usr/bin/env sh` e o `. "$(dirname -- "$0")/_/husky.sh"`
> das versões antigas. Não os adicione.

### 5.3 Reconciliação documental (D-04c)

Corrija **exatamente** estas afirmações, sem reescrever os documentos:

| Arquivo                       | Está escrito                         | Corrigir para                                   |
| ----------------------------- | ------------------------------------ | ----------------------------------------------- |
| `AGENTS.md`                   | Node v20+                            | **Node 24 LTS** (D-01)                          |
| `AGENTS.md`                   | PostgreSQL 16                        | **PostgreSQL 17** (D-01)                        |
| `AGENTS.md`                   | Zod v3                               | **Zod 4** (D-01)                                |
| `AGENTS.md`                   | Playwright (E2E)                     | **`app.inject()` + Vitest** (D-03)              |
| `AGENTS.md`                   | "alteração de permissões RBAC"       | remover — **sem RBAC** (D-09)                   |
| `README.md`                   | Node.js 22+                          | **Node.js 24+** (D-01)                          |
| `README.md`                   | Testes E2E: Playwright               | **Vitest + `app.inject()`** (D-03)              |
| `README.md`                   | tabela de rotas `/api/...`           | **`/api/v1/...`**, conforme spec `03` §2 (D-16) |
| `README.md`                   | "rotas de streaming", "contadores"   | remover — **não existem** (D-10)                |
| `README.md`                   | `@neondatabase/serverless` "avaliar" | remover — **removido** (D-04)                   |
| `README.md`                   | Dockerfile "Node.js 20 Alpine"       | **node:24-alpine**                              |
| `README.md`                   | docker-compose "PostgreSQL 16"       | **PostgreSQL 17**                               |
| `rules/testing.md`            | seção 1.3 Playwright                 | reescrever para `app.inject()` (D-03)           |
| `skills/test-runner/SKILL.md` | `pnpm playwright test`               | `pnpm vitest run --project e2e`                 |
| `mcp_config.json`             | bloco `playwright`                   | **remover** (D-03)                              |

Acrescente ao `README.md` um bloco curto apontando para `docs/specs/` e
`docs/sprints/README.md` como fonte de verdade do escopo.

> ⚠️ Os `mcp_config.json` mantêm os placeholders de token
> (`seu_token_github_aqui`, `sua_chave_upstash`). **Não coloque credencial real** — o
> repositório é público (D-05).

### 5.4 Git e GitHub

```bash
gh auth status                                  # se falhar, PARE
git init -b main
git add -A
git commit -m "chore(setup): configura repositorio git flow e hooks de qualidade"
gh repo create cardoso-sound-api --public --source=. --push \
  --description "API RESTful de catálogo musical para app Flutter — Fastify 5, TypeScript, PostgreSQL, Drizzle"
git checkout -b develop && git push -u origin develop
gh repo edit --default-branch develop
```

Depois, os rulesets (spec `06` §1) em `main` e `develop`: PR obrigatório, push direto
bloqueado, histórico linear. **O status check `ci` só pode ser exigido depois de F1-S04** —
configure agora sem ele e registre a pendência em `PROGRESS.md`.

> **Exceção de fluxo, única no projeto:** o commit inicial vai direto em `main` porque
> o repositório ainda não existe. A partir daqui, **todo** trabalho passa por
> `feature/*` → PR → `develop`. As correções documentais da §5.3 vão na branch
> `feature/f1s01-repositorio-e-gitflow`, com PR normal.

---

## 6. Casos de teste obrigatórios

Sem Vitest neste sprint (a suíte só nasce em F1-S02). As provas são executáveis:

| #   | Verificação                             | Como provar                                           |
| --- | --------------------------------------- | ----------------------------------------------------- |
| T1  | commitlint rejeita mensagem inválida    | `echo "mensagem ruim" \| pnpm commitlint` → sai ≠ 0   |
| T2  | commitlint aceita mensagem válida       | `echo "feat(setup): x" \| pnpm commitlint` → sai 0    |
| T3  | commitlint rejeita escopo fora da lista | `echo "feat(banana): x" \| pnpm commitlint` → sai ≠ 0 |
| T4  | `.env` está ignorado                    | `git check-ignore -v .env` casa                       |
| T5  | `.env.example` **não** está ignorado    | `git check-ignore .env.example` → sai ≠ 0             |
| T6  | pre-commit dispara                      | commit com `.md` sujo → Prettier reformata            |
| T7  | Repositório público, default `develop`  | comandos `gh` da §3                                   |
| T8  | Nenhum segredo no histórico             | `git log --all -p \| grep -iE '(ghp_                  | sk- | password=)'` → vazio |

---

## 7. Definition of Done

```bash
gh repo view --json visibility,defaultBranchRef
git ls-remote --heads origin          # main + develop
echo "x" | pnpm commitlint            # falha, como esperado
git check-ignore -v .env              # casa
```

- [ ] T1–T8 verificados
- [ ] `lintstagedrc.json` (sem ponto) removido e `.lintstagedrc.json` criado
- [ ] As 15 correções documentais da §5.3 aplicadas
- [ ] `mcp_config.json` sem `playwright` e sem credencial real
- [ ] PR aberto para `develop` com o corpo padrão (spec `06` §4)
- [ ] `PROGRESS.md` atualizado; `F1-S01.md` criado; pendência do check `ci` registrada
- [ ] Nenhum arquivo fora do blast radius

`pnpm typecheck`, `lint`, `test` e `build` **ainda falham** neste ponto — é esperado, e
o CI ainda não existe. Não tente consertá-los aqui: é F1-S02.

---

## 8. Armadilhas conhecidas

1. **`lintstagedrc.json` sem ponto não é lido.** O lint-staged procura `.lintstagedrc.json`
   via cosmiconfig. O arquivo do scaffold está com o nome errado — por isso o passo de
   renomear é explícito.
2. **Husky 9 mudou o formato do hook.** Sem shebang, sem `husky.sh`. Copiar exemplo antigo
   gera aviso de deprecação e, em breve, hook quebrado.
3. **`gh repo create --source=.` exige commit prévio.** Rodar antes do primeiro commit falha.
4. **`gh auth login` é interativo** e o agente não consegue completá-lo. É pré-requisito
   humano — se `gh auth status` falhar, pare e peça.
5. **Não reescreva `README.md` e `AGENTS.md` do zero.** São documentos longos e bons; faça
   correções cirúrgicas nas 15 linhas listadas.
6. **`subject-case: lower-case`** rejeita mensagem começando com maiúscula. Escreva
   `feat(setup): configura ...`, não `feat(setup): Configura ...`.

---

## 9. Registro na memória

- **`DECISIONS.md`** — só se surgir decisão global nova.
- **`PROGRESS.md`** — F1-S01 ✅, próximo = F1-S02, remover B1 e B3, acrescentar a
  pendência "exigir check `ci` no ruleset após F1-S04".
- **`F1-S01.md`** — a partir de `_TEMPLATE.md`. Registre a URL do repositório e a lista
  final de correções documentais.
