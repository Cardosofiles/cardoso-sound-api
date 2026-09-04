# Plano de Implementação — Sprint F1-S04: Pipeline de CI

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Etapa 3 do Protocolo)  
> **Fase:** F1 — Fundação  
> **Branch Alvo:** `feature/f1s04-pipeline-ci` (a partir de `develop`)  
> **Specs de Referência:** [`docs/specs/06-git-ci-cd-e-deploy.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/06-git-ci-cd-e-deploy.md) (§4 e §5), [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md), [`docs/sprints/fase-1-fundacao/F1-S04-pipeline-ci.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-1-fundacao/F1-S04-pipeline-ci.md)

---

## 1. Contexto e Objetivos

A sprint **F1-S04** fecha o ciclo de garantia de qualidade contínua da API (D-07):

1. A partir deste sprint, **nenhum PR entra em `develop` sem CI verde**.
2. Resolve a pendência **P1** deixada por F1-S01: os rulesets de `main` e `develop` passam a exigir o check obrigatório **`ci`** com histórico linear e branches atualizadas antes do merge.
3. Padroniza a abertura de pull requests através de `.github/pull_request_template.md`.
4. Comprova empiricamente a resiliência e bloqueio do gate de CI através da bateria de testes T1 a T6.

---

## 2. Blast Radius e Controle Estrito de Arquivos

Em total conformidade com a seção 4 da sprint:

### Preencher (atualmente com 0 bytes):

- [`.github/workflows/ci.yml`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.github/workflows/ci.yml)

### Criar:

- [`.github/pull_request_template.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.github/pull_request_template.md)
- [`docs/agents-plans/plan-f1-s04-pipeline-ci.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/agents-plans/plan-f1-s04-pipeline-ci.md) (Regra 6 do `AGENTS.md`)

### Editar:

- [`.agents/memory/PROGRESS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/PROGRESS.md)
- [`.agents/memory/F1-S04.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/F1-S04.md) (criado a partir de `_TEMPLATE.md`)

### Configurar (estado no GitHub via API):

- Ruleset `protection-develop` (ID: 22217165) → adicionar status check obrigatório `ci` e branch up-to-date
- Ruleset `protection-main` (ID: 22217216) → adicionar status check obrigatório `ci` e branch up-to-date

### Arquivos Intocáveis nesta Sprint:

- `.github/workflows/deploy.yml` (escopo de F5-S02)
- Qualquer arquivo de aplicação/teste: `src/**`, `tests/**`, `package.json`, `drizzle.config.ts`, `Dockerfile`, etc.
  _(Nota: alterações em `package.json`, código ou testes ocorrerão única e exclusivamente de forma temporária durante os testes de falha T2, T3 e T4, sendo integralmente revertidas antes do PR final)._

---

## 3. Especificação Técnica dos Contratos

### 3.1 Workflow de CI (`.github/workflows/ci.yml`)

Implementação normativa de `docs/specs/06-git-ci-cd-e-deploy.md` (§5):

```yaml
name: ci

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        # Versão omitida intencionalmente: herdada de packageManager no package.json

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

#### Invariantes Técnicas do Workflow:

1. **Nome do job:** `ci` exatamente (requisito do ruleset de proteção).
2. **Permissão mínima:** `permissions: contents: read` (princípio do menor privilégio).
3. **Concorrência:** `ci-${{ github.ref }}` com `cancel-in-progress: true` para evitar consumo inútil de runners em pushes sucessivos no mesmo PR.
4. **Ordem de setup:** `pnpm/action-setup` **antes** de `actions/setup-node`, viabilizando o cache automático de dependências do pnpm sem conflitos.
5. **Sem versão redundante no pnpm:** Evita o erro `"Multiple versions of pnpm specified"`, consumindo `pnpm@11.25.0` do `package.json`.
6. **Ordem de validação rápida:** `lint` → `typecheck` → `test` → `build` (falha barata primeiro).

---

### 3.2 Template de Pull Request (`.github/pull_request_template.md`)

Estrutura padronizada conforme `docs/specs/06-git-ci-cd-e-deploy.md` (§4):

```markdown
## Sprint

<!-- Ex: F1-S04 — Pipeline de CI · docs/sprints/fase-1-fundacao/F1-S04-pipeline-ci.md -->

## O que foi feito

-

## Contratos entregues

-

## Testes

- Unit:
- Integração:

## Decisões registradas

-

## Checklist

- [ ] typecheck · [ ] lint · [ ] format · [ ] test · [ ] build
- [ ] Casos obrigatórios do sprint cobertos
- [ ] PROGRESS.md atualizado · [ ] F<n>-S<nn>.md criado
- [ ] Nenhum arquivo fora do blast radius
```

---

### 3.3 Configuração de Rulesets no GitHub

Atualização dos rulesets existentes via `gh api`:

- `protection-develop` (ID `22217165`)
- `protection-main` (ID `22217216`)

#### Payload de Atualização de Cada Ruleset (`PUT /repos/Cardosofiles/cardoso-sound-api/rulesets/{id}`):

```json
{
  "name": "protection-develop",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/develop"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": true,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_linear_history"
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          {
            "context": "ci"
          }
        ]
      }
    }
  ],
  "bypass_actors": []
}
```

_(Idêntico para `protection-main`, ajustando apenas `"name": "protection-main"` e ref para `refs/heads/main`)._

---

## 4. Matriz de Provas & Casos de Teste (T1 a T6)

Não há testes Vitest adicionais nesta sprint. A conformidade é atestada pelas reações do CI e do GitHub:

| #      | Caso de Teste                           | Método de Execução e Verificação                                                       | Critério de Aceite                                                                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **T1** | CI roda no PR e fica verde              | `gh run watch --exit-status` após push do PR                                           | Saída com código `0`, status `completed` e conclusão `success`                                           |
| **T2** | CI falha quando o lint falha            | Commit temporário inserindo violação de tipagem/lint (ex: `const x: any = 1;`) e push  | Job `ci` falha exatamente no step `Lint` com saída `!= 0`; revertido logo em seguida via `git revert`    |
| **T3** | CI falha quando um teste falha          | Commit temporário alterando asserção em `tests/unit/shared/pagination.test.ts` e push  | Job `ci` falha exatamente no step `Test`; revertido logo em seguida via `git revert`                     |
| **T4** | Lockfile desatualizado quebra o install | Modificação no `package.json` sem rodar `pnpm install` e push                          | Job `ci` falha no step `Install dependencies` (`ERR_PNPM_OUTDATED_LOCKFILE`); revertido via `git revert` |
| **T5** | Push direto em `develop` é rejeitado    | `git commit --allow-empty` em `develop` local e tentativa de `git push origin develop` | Rejeição imediata pelo remote com mensagem do ruleset `protection-develop`                               |
| **T6** | Concurrency cancela run antiga          | Disparo de dois pushes em sequência na branch                                          | Primeira execução transiciona para status `cancelled` automaticamente                                    |

> **Aviso de Integridade:** As mutações de T2, T3 e T4 são estritamente temporárias e sequenciais. Cada uma será executada, validada, anotada na memória e imediatamente revertida. Nenhum resíduo de código defeituoso sobreviverá no PR final.

---

## 5. Roteiro Passo a Passo de Execução

### Etapa 4 — Implementação

1. **Criação da Branch de Trabalho:**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/f1s04-pipeline-ci
   ```

2. **Configuração dos Rulesets no GitHub:**
   - Executar `gh api --method PUT repos/Cardosofiles/cardoso-sound-api/rulesets/22217165` com `required_status_checks: ["ci"]`.
   - Executar `gh api --method PUT repos/Cardosofiles/cardoso-sound-api/rulesets/22217216` com `required_status_checks: ["ci"]`.
   - Inspecionar e salvar o JSON de retorno para inclusão em `.agents/memory/F1-S04.md`.

3. **Execução do Caso T5 (Prova de Bloqueio de Push Direto):**

   ```bash
   git checkout develop
   git commit --allow-empty -m "chore(ci): teste de bloqueio"
   git push origin develop
   # Capturar a mensagem de rejeição do GitHub
   git reset --hard origin/develop
   git checkout feature/f1s04-pipeline-ci
   ```

4. **Escrita dos Arquivos do Blast Radius:**
   - Preencher `.github/workflows/ci.yml`.
   - Criar `.github/pull_request_template.md`.

5. **Validação Local:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
   ```

### Etapa 5 e 6 — Validação, Entrega e Provas Destrutivas

6. **Primeiro Commit e Criação do Pull Request:**

   ```bash
   git add .github/workflows/ci.yml .github/pull_request_template.md docs/agents-plans/plan-f1-s04-pipeline-ci.md
   git commit -m "ci(ci): F1-S04 — pipeline de integracao continua"
   git push -u origin feature/f1s04-pipeline-ci
   gh pr create --base develop --title "ci(ci): F1-S04 — pipeline de integração contínua" --body "..."
   ```

7. **Validação do Caso T1:**
   - Monitorar a execução com `gh run watch --exit-status`.
   - Medir e registrar o tempo total da execução.

8. **Execução Controlada dos Casos T2, T3, T4 e T6:**
   - Executar mutação T2 (`lint`) → push → aguardar falha vermelha no step `Lint` → reverter commit → push.
   - Executar mutação T3 (`test`) → push → aguardar falha vermelha no step `Test` → reverter commit → push.
   - Executar mutação T4 (`lockfile`) → push → aguardar falha vermelha no step `Install dependencies` → reverter commit → push.
   - Observar e registrar no mínimo uma corrida cancelada pelo mecanismo de `concurrency` (T6).
   - Garantir que a branch retornou ao estado limpo com a última execução do CI 100% verde (🟢).

### Etapa 7 — Registro de Memória

9. **Atualização da Memória:**
   - Atualizar `.agents/memory/PROGRESS.md`: marcar F1-S04 como concluído, remover pendência P1, apontar próximo sprint para F1-S05.
   - Criar `.agents/memory/F1-S04.md` com:
     - JSON dos rulesets atualizados.
     - Saída literal da rejeição do push direto (T5).
     - Logs comprovando T1, T2, T3, T4 e T6.
     - Tempo médio de execução do job no Actions.
   - Commit semântico da memória:
     ```bash
     git add .agents/memory/PROGRESS.md .agents/memory/F1-S04.md
     git commit -m "docs(ci): registra conclusao do sprint F1-S04 na memoria"
     git push origin feature/f1s04-pipeline-ci
     gh run watch --exit-status
     ```

10. **Parada Obrigatória:**
    - Reportar link do PR e status verde ao usuário.
    - Encerrar sessão sem realizar merge (D-06).

---

## 6. Definition of Done (DoD)

- [ ] Rulesets em `main` e `develop` exigindo `ci` e branches atualizadas
- [ ] Job do GitHub Actions nomeado rigorosamente `ci`
- [ ] `permissions: contents: read` declarado
- [ ] `concurrency` com `cancel-in-progress` configurado
- [ ] Template `.github/pull_request_template.md` criado
- [ ] Provas T1 a T6 registradas; T2, T3 e T4 totalmente revertidos
- [ ] Saída da rejeição de push direto (T5) anexada em `F1-S04.md`
- [ ] Tempo de execução do CI registrado
- [ ] Memória (`PROGRESS.md` e `F1-S04.md`) atualizada e sincronizada no PR
