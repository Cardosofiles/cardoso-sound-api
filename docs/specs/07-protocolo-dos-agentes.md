# 07 — Protocolo de Sessão dos Agentes

> Como uma sessão do Antigravity/Gemini CLI começa, executa e termina.
> **Uma sessão = um sprint = um PR.** Fora disso, não comece.

---

## 1. As sete etapas

```
┌─ 1. CONTEXTUALIZAR ── lê PROGRESS.md, DECISIONS.md e o sprint alvo
│
├─ 2. PLANEJAR ──────── modo plano: raciocina sobre a implementação COMPLETA
│
├─ 3. AUTORIZAR ─────── apresenta o plano e ESPERA o "pode ir"     ⏸ PARADA 1
│
├─ 4. IMPLEMENTAR ───── código + testes, só dentro do blast radius
│
├─ 5. VALIDAR ───────── typecheck → lint → format → test → build
│
├─ 6. ENTREGAR ─────── branch → commits → push → PR → gh run watch
│
└─ 7. REGISTRAR ────── DECISIONS.md + PROGRESS.md + F<n>-S<nn>.md   ⏸ PARADA 2
                        e PARA. Não faz merge. Não começa o próximo.
```

Há exatamente **duas paradas obrigatórias**. Ignorá-las é a falha mais grave do protocolo.

---

## 2. Etapa 1 — Contextualizar

Ordem de leitura, sempre:

1. `.agents/memory/PROGRESS.md` — qual é o próximo sprint e o que já existe
2. `.agents/memory/DECISIONS.md` — decisões vigentes; **elas vencem qualquer suposição**
3. `docs/sprints/fase-<n>-<nome>/F<n>-S<nn>-<slug>.md` — o sprint alvo
4. As specs que o sprint listar em _Specs obrigatórias_

**Não leia os `F<n>-S<nn>.md` de sprints anteriores por padrão.** Eles existem para
consulta pontual — quando o sprint atual depender de detalhe de implementação de um
anterior, ou quando algo não bater com o esperado. Carregar todos queima contexto à toa.

Se `PROGRESS.md` apontar um sprint diferente do pedido, **pergunte antes de seguir**.

---

## 3. Etapa 2 — Planejar

Antes de escrever a primeira linha, produza um plano que responda:

- Quais arquivos serão criados e quais editados — conferir contra o **blast radius**
- Qual contrato exato cada arquivo implementa (rota, assinatura, schema Zod)
- Quais testes serão escritos e a qual caso obrigatório cada um corresponde
- Qual migração será gerada, se houver, e qual SQL ela deve conter
- O que **não** será feito neste sprint, mesmo parecendo relacionado

Se o sprint exigir algo que as specs não definem: **pare aqui**, descreva o buraco, e
pergunte. Não invente contrato — um contrato inventado no sprint 7 quebra o sprint 12.

---

## 4. Etapa 3 — Autorizar ⏸

Apresente o plano e **espere aprovação explícita**. Não interprete silêncio,
"ok" ambíguo ou uma pergunta de esclarecimento como autorização.

---

## 5. Etapa 4 — Implementar

| Regra                        | Detalhe                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Blast radius fechado**     | Só os arquivos listados no sprint. Precisa de outro? **Pare e pergunte.**          |
| **Sem `any`**                | `unknown` + type guard                                                             |
| **Sem `console.*`**          | `request.log` / `fastify.log`                                                      |
| **Import com `.js`**         | Exigência de ESM + NodeNext                                                        |
| **Teste junto**              | Não deixe para o fim; escreva com o código                                         |
| **Sem TODO**                 | Ou implementa, ou fica fora do sprint                                              |
| **Sem refactor oportunista** | Viu problema fora do escopo? Anote em `DECISIONS.md` como _pendência_, não corrija |

Use os subagentes de `.agents/agents/` quando a tarefa for profunda numa disciplina:
`db-specialist` para schema e migração · `api-developer` para rotas/services/repositories ·
`qa-engineer` para as suítes · `security-reviewer` antes de fechar sprint de auth ·
`backend-architect` quando um contrato estiver ambíguo.

MCP: **context7** para confirmar API de Drizzle/Fastify/Better Auth antes de codar —
especialmente Better Auth, que muda rápido. **postgres** para inspecionar constraint que
falhou. **github** para PR e issues.

---

## 6. Etapa 5 — Validar

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
```

Falhou, **parou**. Corrija antes de seguir. Nunca comite com portão vermelho contando
que o CI resolve.

---

## 7. Etapa 6 — Entregar

```bash
git checkout develop && git pull origin develop
git checkout -b feature/f2s04-modulo-tracks
git add -A
git commit -m "feat(tracks): adiciona listagem paginada com busca e filtros"
git push -u origin feature/f2s04-modulo-tracks
gh pr create --base develop --title "…" --body-file <corpo da spec 06 §4>
gh run watch --exit-status
```

CI vermelho → protocolo da spec `06` §5: até 3 tentativas, depois **para e reporta**.

---

## 8. Etapa 7 — Registrar ⏸

Três arquivos, sempre nesta ordem, e **commitados no mesmo PR**:

### `.agents/memory/DECISIONS.md`

Só o que é **global e duradouro**. Uma entrada nova recebe o próximo `D-nn`:

```markdown
### D-31 · Título curto e afirmativo

- **Data:** 2026-09-10 · **Sprint:** F2-S04 · **Status:** vigente
- **Contexto:** o que forçou a decisão
- **Decisão:** o que ficou valendo
- **Consequência:** o que isso obriga ou impede daqui pra frente
```

Não registre aqui: detalhe de implementação de um sprint (vai no `F<n>-S<nn>.md`) nem
o que já está numa spec.

### `.agents/memory/PROGRESS.md`

Marca o sprint como `✅ concluído`, com data, link do PR e resumo de uma linha.
Aponta o **próximo** sprint. Este é o arquivo que a próxima sessão lê primeiro.

### `.agents/memory/F<n>-S<nn>.md`

Resumo do que foi implementado, a partir de `_TEMPLATE.md`. Existe para uma sessão
futura entender **como** algo foi feito sem reler o diff. Não é carregado
automaticamente.

**Depois disso, a sessão acabou.** Reporte o link do PR e pare. Não faça merge, não
comece o próximo sprint, não "adiante" nada.

---

## 9. Quando parar e perguntar

Pare **sempre** que:

- A spec não cobre o caso e você teria que inventar um contrato
- Duas specs se contradizem
- O sprint exigiria tocar arquivo fora do blast radius
- A migração gerada contém `DROP` ou `ALTER TYPE` inesperado
- O CI falhou 3 vezes
- Um teste só passa se você relaxar uma asserção ou a spec
- Uma dependência precisa ser adicionada, removida ou trocada de major
- Você percebe que o sprint é maior do que uma sessão

Parar e perguntar **não é falha**. Entregar meio sprint silenciosamente é.

---

## 10. Prompt de abertura (padrão)

Todo `F<n>-S<nn>-*.md` traz este bloco preenchido na primeira seção. Cole-o e nada mais:

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-<n>-<nome>/F<n>-S<nn>-<slug>.md
Specs obrigatórias: docs/specs/<lista do sprint>

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```
