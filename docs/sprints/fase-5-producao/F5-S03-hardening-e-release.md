# F5-S03 — Hardening, Auditoria e Release `v1.0.0`

|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| **Fase**       | F5 — Produção · **último sprint do projeto**                      |
| **Branch**     | `feature/f5s03-hardening-e-release`                               |
| **Depende de** | F5-S02                                                            |
| **Entrega**    | Auditoria de segurança aprovada, documentação final, tag `v1.0.0` |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia TODOS os arquivos .agents/memory/F*-S*.md — este é o único sprint em que isso
se justifica: a auditoria precisa da história completa.

Sprint alvo: docs/sprints/fase-5-producao/F5-S03-hardening-e-release.md
Specs obrigatórias: docs/specs/04-autenticacao-e-seguranca.md (§7),
                    docs/specs/00-visao-geral.md, docs/specs/06-git-ci-cd-e-deploy.md (§6)

Use o subagente security-reviewer (.agents/agents/security-reviewer.md) para a §5.1.

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Fechar o MVP: passar o checklist de auditoria de segurança, reconciliar a documentação com
o que foi **de fato** construído, e cortar a `v1.0.0`.

**Este sprint pode encontrar problemas que exigem correção.** Diferente de F4-S03, aqui a
correção **está autorizada** — mas só para itens do checklist da spec `04` §7. Qualquer
outra coisa vira issue, não commit.

---

## 3. Contratos esperados

Nenhuma rota nova. As entregas:

1. Checklist da **spec `04` §7** com os 11 itens verificados e evidência de cada um
2. `docs/AUDITORIA.md` com o resultado
3. `README.md` reconciliado com a realidade
4. `docs/FLUTTER.md` — guia de integração para o cliente
5. Tag `v1.0.0` e GitHub Release

---

## 4. Blast radius

### Criar

```
docs/AUDITORIA.md
docs/FLUTTER.md
docs/sprints/fase-5-producao/RELEASE.md      # notas da v1.0.0
```

### Editar

```
README.md
AGENTS.md                          # se ainda houver divergência com o construído
.agents/rules/*.md                 # idem — as rules devem descrever o código real
src/**                             # SOMENTE correções do checklist da spec 04 §7
.agents/memory/DECISIONS.md
.agents/memory/PROGRESS.md
.agents/memory/F5-S03.md
```

> `src/**` está no blast radius **apenas** para correções de segurança do checklist.
> Qualquer outra mudança: pare e pergunte.

---

## 5. Passo a passo

### 5.1 Auditoria de segurança

Percorra os 11 itens da **spec `04` §7**, um a um, com evidência. Delegue ao subagente
`security-reviewer`.

| #   | Item                                                    | Como provar                                                          |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `.env` fora do git, em todo o histórico                 | `git log --all --name-only --diff-filter=A \| grep -x '\.env'` vazio |
| 2   | `mcp_config.json` sem token real                        | leitura + `grep` por padrões de token                                |
| 3   | `/me` não expõe `password`/`emailVerified`              | resposta real em produção                                            |
| 4   | 500 não devolve stack nem mensagem interna              | provoque um erro; leia o corpo                                       |
| 5   | `redact` do Pino cobre os 6 caminhos                    | provoque 401 em produção; leia os logs                               |
| 6   | Toda rota protegida tem `requireAuth`                   | percorra as 13 rotas de `Profile` + `Library`                        |
| 7   | Acesso a recurso de usuário filtra por `user_id` no SQL | leia os `where` dos repositories                                     |
| 8   | Rate limit e CORS restritos em produção                 | T11/T12 de F5-S02                                                    |
| 9   | Headers do helmet ativos                                | `curl -I` na URL pública                                             |
| 10  | Zero `any` e zero `@ts-expect-error` sem justificativa  | `grep -rn ': any\|@ts-expect-error' src/`                            |
| 11  | `pnpm audit --prod` sem alta/crítica                    | saída do comando                                                     |

**Achou problema?** Corrija (está autorizado) **e** registre em `docs/AUDITORIA.md` o que
foi encontrado, o impacto e a correção. Um achado corrigido em silêncio não vale.

### 5.2 `docs/AUDITORIA.md`

Tabela dos 11 itens com status ✅/⚠️/❌, evidência resumida e link para o commit da
correção quando houver. Encerre com data, versão auditada e resumo em uma linha.

### 5.3 `docs/FLUTTER.md`

O que o desenvolvedor do app precisa, sem ler o código:

- URL base de produção e de desenvolvimento
- Fluxo de autenticação: sign-up → guardar `set-auth-token` → enviar `Authorization: Bearer`
- Como usar `flutter_secure_storage` para o token
- Envelope `{ data, meta }` e como paginar
- Envelope de erro e o significado de cada status
- Contrato de `Track` e o campo `audioUrl` para o `just_audio`
- Filtros de `/tracks`: `search`, `genre`, `artistId`, `sort`
- Link para `docs/openapi.json` e para `/docs`
- Nota explícita: **playlist alheia responde 404, não 403** (D-31)

### 5.4 Reconciliação final da documentação

`README.md`, `AGENTS.md` e `.agents/rules/**` devem descrever **o que existe**, não o que
foi planejado. Percorra `DECISIONS.md` inteiro e confira cada decisão contra o texto.

Suspeitos prováveis, se F1-S01 não pegou tudo: menção a Playwright, Neon, `/api` sem `v1`,
Zod 3, Node 20/22, Postgres 16, RBAC, streaming, contadores.

Acrescente ao README: badge do CI, a URL pública, e um link para `docs/specs/` e
`docs/sprints/`.

### 5.5 Release `v1.0.0`

`docs/sprints/fase-5-producao/RELEASE.md` com as notas consolidadas das 5 fases —
monte a partir dos `F<n>-S<nn>.md`. Depois, o procedimento da **spec `06` §6**.

Bump de `version` no `package.json` para `1.0.0` (o `openapi.json` referencia esse valor:
rode `pnpm openapi:export` de novo, senão o `--check` do CI falha).

---

## 6. Casos de teste obrigatórios

| #   | Caso                                                  | Esperado                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------- |
| T1  | Suíte completa                                        | `pnpm test` verde                                   |
| T2  | Suíte E2E contra o build de produção                  | `pnpm build && node dist/server.js` responde        |
| T3  | Os 11 itens da auditoria                              | documentados em `docs/AUDITORIA.md`                 |
| T4  | `pnpm audit --prod`                                   | sem alta/crítica                                    |
| T5  | `grep -rn ': any' src/`                               | vazio                                               |
| T6  | Nenhum `it.skip` / `describe.skip`                    | `grep -rn '\.skip(' tests/` vazio                   |
| T7  | `--check` do OpenAPI após o bump de versão            | passa                                               |
| T8  | Todas as 25 rotas respondem em produção               | script de smoke contra a URL pública                |
| T9  | Fluxo E2E manual em produção                          | sign-up → playlist → favoritar → tocar o `audioUrl` |
| T10 | `DECISIONS.md` não tem decisão contradita pelo código | revisão item a item                                 |
| T11 | `PROGRESS.md` com os 18 sprints ✅                    |                                                     |
| T12 | Existem 18 arquivos `F<n>-S<nn>.md`                   | `ls .agents/memory/F*.md \| wc -l` = 18             |

---

## 7. Definition of Done

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm audit --prod
pnpm openapi:export -- --check
curl -s https://<app>.up.railway.app/health/ready | jq
curl -sI https://<app>.up.railway.app/api/v1/tracks | head -20
```

- [ ] T1–T12 verificados
- [ ] `docs/AUDITORIA.md` com os 11 itens e evidência
- [ ] `docs/FLUTTER.md` completo
- [ ] README, AGENTS.md e rules sem nenhuma afirmação falsa
- [ ] `version: 1.0.0` e `openapi.json` regenerado
- [ ] `release/v1.0.0` preparada, PR para `main` aberto, `RELEASE.md` escrito
- [ ] **`PROGRESS.md` com os 18 sprints ✅ e o roadmap encerrado**

---

## 8. Armadilhas conhecidas

1. **Auditoria vira refatoração.** O blast radius de `src/` cobre **só** os 11 itens do
   checklist. Achou código feio? Vira issue.
2. **Bump de versão sem regenerar o `openapi.json`** quebra o `--check` do CI, e a causa
   não é óbvia no log.
3. **`git log --all` para segredo** precisa cobrir todas as branches, não só `main`. Um
   segredo em branch de feature já mergeada continua no histórico.
4. **`pnpm audit` sem `--prod`** acusa vulnerabilidade de devDependency, que não vai para
   produção. Use `--prod` para o gate e cite o resto como informação.
5. **Back-merge de `main` para `develop`** depois da tag. Esquecer deixa as branches
   divergentes para sempre (spec `06` §6).
6. **`docs/FLUTTER.md` escrito a partir da spec, não da API real.** Teste cada exemplo
   contra a URL pública antes de publicar.
7. **Corrigir a documentação para bater com um bug** em vez de corrigir o bug. Se o código
   contradiz uma decisão de `DECISIONS.md`, **pare e pergunte** qual dos dois está errado.

---

## 9. Registro na memória

- **`DECISIONS.md`** — achados da auditoria que viraram regra permanente; qualquer item
  aceito como risco conhecido, com justificativa.
- **`PROGRESS.md`** — F5-S03 ✅, **fase F5 concluída**, **projeto concluído**, tag
  `v1.0.0`, URL pública. Acrescente uma seção "Próximos passos" com o que ficou fora do
  MVP (spec `00` §3) para quem retomar depois.
- **`F5-S03.md`** — o resultado da auditoria e a lista final de correções aplicadas.

---

## 10. Depois deste sprint

O MVP está entregue. O que ficou deliberadamente de fora está na **spec `00` §3** e
continua fora até uma nova rodada de especificação. Candidatos naturais a uma v1.1:

`position` nas playlists · playlists públicas · histórico de reprodução · painel admin com
RBAC · recuperação de senha · OAuth social · upload de capa e avatar.

Nenhum deles deve ser implementado sem passar antes por spec e sprint.
