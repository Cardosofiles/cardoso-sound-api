# F1-S04 — Pipeline de CI

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| **Fase**       | F1 — Fundação                                                                |
| **Branch**     | `feature/f1s04-pipeline-ci`                                                  |
| **Depende de** | F1-S03                                                                       |
| **Entrega**    | `ci.yml` completo, verde no PR, e exigido pelo ruleset de `main` e `develop` |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-1-fundacao/F1-S04-pipeline-ci.md
Specs obrigatórias: docs/specs/06-git-ci-cd-e-deploy.md (§5)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fechar o ciclo de qualidade: a partir daqui **nenhum PR entra em `develop` sem CI verde**
(D-07). Este é o sprint que torna todos os seguintes verificáveis automaticamente.

Também resolve a pendência deixada por F1-S01: o ruleset ainda não exige o check `ci`
porque ele não existia.

---

## 3. Contratos esperados

| Verificação                 | Comando                                            | Esperado                             |
| --------------------------- | -------------------------------------------------- | ------------------------------------ |
| Workflow existe e é válido  | `gh workflow list`                                 | `ci` listado                         |
| Job nomeado `ci`            | `gh run view --json jobs -q '.jobs[].name'`        | contém `ci`                          |
| CI verde no PR deste sprint | `gh run watch --exit-status`                       | sai `0`                              |
| Check exigido no ruleset    | `gh api repos/:owner/:repo/rulesets`               | `required_status_checks` inclui `ci` |
| Push direto bloqueado       | `git push origin develop` a partir de commit local | rejeitado                            |

---

## 4. Blast radius

### Preencher (0 bytes hoje)

```
.github/workflows/ci.yml
```

### Criar

```
.github/pull_request_template.md
```

### Editar

```
.agents/memory/PROGRESS.md
.agents/memory/F1-S04.md
```

### Configurar (não é arquivo — é estado do GitHub)

```
ruleset de main   → required status check: ci
ruleset de develop → required status check: ci
```

**Não toque em:** `.github/workflows/deploy.yml` (é F5-S02) · qualquer `src/**`,
`tests/**`, `package.json`.

---

## 5. Passo a passo

### 5.1 `ci.yml`

Estrutura normativa na **spec `06` §5**. Pontos que não podem faltar:

| Item              | Valor                                         | Por quê                                            |
| ----------------- | --------------------------------------------- | -------------------------------------------------- |
| `name` do job     | **`ci`**                                      | é o nome que o ruleset exige — mudar quebra o gate |
| `runs-on`         | `ubuntu-latest`                               | tem daemon Docker para Testcontainers              |
| `timeout-minutes` | `15`                                          | corta run travada                                  |
| `concurrency`     | `ci-${{ github.ref }}` + `cancel-in-progress` | cancela runs antigas do mesmo PR                   |
| Node              | `24` com `cache: pnpm`                        | D-01                                               |
| pnpm              | `pnpm/action-setup@v4` **sem `version`**      | a versão vem de `packageManager`                   |
| Install           | `pnpm install --frozen-lockfile`              | lockfile desatualizado deve quebrar                |
| Ordem             | lint → typecheck → test → build               | falha barata primeiro                              |

Ordem dos steps de setup importa: `pnpm/action-setup` **antes** de `actions/setup-node`,
senão `cache: pnpm` não encontra o gerenciador e o step falha.

```yaml
permissions:
  contents: read
```

> Permissão mínima explícita. O job só lê o repositório.

### 5.2 Template de PR

`.github/pull_request_template.md` com o corpo padrão da **spec `06` §4** (Sprint,
O que foi feito, Contratos entregues, Testes, Decisões, Checklist). Assim o agente
preenche em vez de inventar formato.

### 5.3 Rulesets

Em `main` e `develop`:

- ✅ Require a pull request before merging (1 aprovação **ou** merge do dono)
- ✅ Require status checks to pass → **`ci`**
- ✅ Require branches to be up to date before merging
- ✅ Require linear history
- ❌ Não permitir force push
- ❌ Não permitir deleção

Via CLI (`gh api ... --method POST /repos/{owner}/{repo}/rulesets`) ou pela interface —
tanto faz. **Registre no `F1-S04.md` qual caminho foi usado e o JSON final**, para
reproduzir depois.

### 5.4 Prova de que o gate funciona

Depois de o ruleset estar ativo, prove que ele realmente bloqueia:

```bash
git checkout develop
git commit --allow-empty -m "chore(ci): teste de bloqueio"
git push origin develop        # DEVE ser rejeitado pelo ruleset
git reset --hard origin/develop
```

Cole a saída da rejeição no `F1-S04.md`. Um gate que ninguém testou não é um gate.

---

## 6. Casos de teste obrigatórios

Não há Vitest neste sprint. As provas são o comportamento do próprio CI:

| #   | Caso                                    | Como provar                                                                               |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| T1  | CI roda no PR e fica verde              | `gh run watch --exit-status` sai `0`                                                      |
| T2  | CI falha quando o lint falha            | commit temporário com `const x: any = 1` → run vermelha → **reverter**                    |
| T3  | CI falha quando um teste falha          | commit temporário quebrando `pagination.test.ts` → run vermelha → **reverter**            |
| T4  | Lockfile desatualizado quebra o install | editar `package.json` sem rodar `pnpm install` → `--frozen-lockfile` falha → **reverter** |
| T5  | Push direto em `develop` é rejeitado    | §5.4                                                                                      |
| T6  | Concurrency cancela run antiga          | dois pushes seguidos → a primeira run fica `cancelled`                                    |

> T2, T3 e T4 são **destrutivos e temporários**. Faça um por vez, confirme a falha,
> e reverta com `git revert` ou `git reset` antes do próximo. Nenhum deles pode
> sobreviver no PR final.

---

## 7. Definition of Done

```bash
gh workflow list
gh pr create --base develop --title "ci(ci): F1-S04 — pipeline de integração contínua"
gh run watch --exit-status
gh api repos/:owner/:repo/rulesets --jq '.[].name'
```

- [ ] T1–T6 verificados; T2/T3/T4 revertidos
- [ ] Job chamado exatamente `ci`
- [ ] `permissions: contents: read` declarado
- [ ] `concurrency` com `cancel-in-progress`
- [ ] Rulesets em `main` **e** `develop` exigindo `ci`
- [ ] Template de PR criado
- [ ] Tempo total da run registrado no `F1-S04.md`
- [ ] Memória atualizada; pendência do ruleset (de F1-S01) removida

---

## 8. Armadilhas conhecidas

1. **`pnpm/action-setup` depois de `setup-node` quebra o cache.** A ordem correta é
   pnpm primeiro.
2. **Passar `version:` para `pnpm/action-setup` conflita com `packageManager`** do
   `package.json` e falha com "Multiple versions of pnpm specified". Omita.
3. **`pnpm test` sem arquivo de teste sai com erro.** Neste ponto existe
   `pagination.test.ts` (F1-S02), então há o que rodar. **Nunca** adicione
   `--passWithNoTests` para contornar (spec `05` §8).
4. **O ruleset se aplica ao próprio dono do repositório** por padrão. Isso é desejado —
   mas significa que você também precisará de PR para mexer em `develop`. Não crie
   bypass para o dono.
5. **Não adicione step de deploy aqui.** `deploy.yml` é F5-S02 e depende da Railway
   estar configurada.
6. **Não adicione o check do `openapi.json`** — é F5-S01, e o arquivo ainda não existe.

---

## 9. Registro na memória

- **`DECISIONS.md`** — só se o ruleset exigir alguma concessão não prevista.
- **`PROGRESS.md`** — F1-S04 ✅, próximo = F1-S05, CI = 🟢 ativo.
- **`F1-S04.md`** — JSON do ruleset, tempo médio da run, e a saída da rejeição do
  push direto (§5.4).
