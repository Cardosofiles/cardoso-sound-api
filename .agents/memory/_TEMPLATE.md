# F<n>-S<nn> — <Título do sprint>

> Molde dos resumos de sprint. Copie para `.agents/memory/F<n>-S<nn>.md`
> (ex.: `F2-S04.md`) e preencha na **etapa 7** do protocolo.
>
> **Este arquivo não é carregado automaticamente.** Ele existe para uma sessão futura
> entender **como** algo foi feito sem reler o diff inteiro. Escreva para esse leitor:
> alguém competente, sem contexto, com pressa.

---

| Campo            | Valor                      |
| ---------------- | -------------------------- |
| **Sprint**       | F<n>-S<nn>                 |
| **Fase**         | F<n> — <nome>              |
| **Data**         | AAAA-MM-DD                 |
| **PR**           | #<n> — <url>               |
| **Branch**       | `feature/f<n>s<nn>-<slug>` |
| **Commits**      | <n>                        |
| **Status do CI** | ✅ verde na <n>ª execução  |

---

## 1. O que foi entregue

Três a seis linhas, em prosa. **O que a API passa a fazer** que antes não fazia — não a
lista de arquivos, que o diff já mostra.

## 2. Contratos publicados

| Rota / Símbolo    | Arquivo                         | Observação |
| ----------------- | ------------------------------- | ---------- |
| `GET /api/v1/...` | `src/modules/.../....routes.ts` |            |

## 3. Arquivos criados e alterados

| Arquivo   | Ação   | Por quê |
| --------- | ------ | ------- |
| `src/...` | criado |         |

Fora do blast radius: `nenhum` — ou a lista, com a justificativa e a autorização recebida.

## 4. Como funciona — o que o diff não conta

Decisões de implementação que um leitor futuro não deduziria sozinho: por que a query é
assim, por que a ordem de registro importa, qual alternativa foi descartada e por quê.
**É a seção mais valiosa do arquivo.** Se estiver vazia, provavelmente está incompleta.

## 5. Testes

| Caso obrigatório (do sprint) | Arquivo | Como foi coberto |
| ---------------------------- | ------- | ---------------- |
|                              |         |                  |

Total: <n> unitários · <n> integração · <n> E2E. Tempo da suíte: <n>s.

## 6. Armadilhas encontradas

O que quebrou, quanto tempo custou e como foi resolvido. Isto evita que a próxima sessão
tropece na mesma pedra.

| Sintoma | Causa | Solução |
| ------- | ----- | ------- |
|         |       |         |

## 7. Decisões geradas

- `D-nn` — <título> · registrada em `DECISIONS.md`

Ou: `nenhuma`.

## 8. Deixado para depois

Coisas notadas mas deliberadamente fora deste sprint. Cada item diz **em qual sprint**
deve entrar, ou que virou pendência em `PROGRESS.md`.

- [ ] …

## 9. O que o próximo sprint precisa saber

Uma a três linhas objetivas. O estado em que o repositório ficou e o que já pode ser
assumido como pronto.
