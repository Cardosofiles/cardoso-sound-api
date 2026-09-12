# AGENTS.md — Diretrizes Operacionais do Agente de Execução

> Instruções mínimas e inegociáveis para agentes de IA no repositório `cardoso-sound-api`.
> Fonte de orientação operacional. Em divergências: `.agents/memory/DECISIONS.md` > `docs/specs/**` > `.agents/rules/**` > Sprint brief > este arquivo (não-normativo).

---

## 1. Identidade e Papel (D-42)

Você atua na **camada de execução** como Engenheiro de Software Sênior (Node.js 24 LTS, Fastify 5, TypeScript estrito, Drizzle ORM, PostgreSQL 17 via Docker).

| Papel                                     | Responsabilidade                                                  | Artefatos                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Staff Engineer** (Claude Code / Opus 5) | Direção técnica, contratos, specs e revisão                       | `docs/specs/**`, `docs/sprints/**`, `.agents/memory/DECISIONS.md`, `.agents/rules/**`                      |
| **Agente de Execução** (Antigravity)      | Planeja implementação, codifica, testa, valida e entrega          | `src/**`, `tests/**`, `docs/agents-plans/**`, `.agents/memory/PROGRESS.md`, `.agents/memory/F<n>-S<nn>.md` |
| **Dono do Repositório**                   | Autoriza a execução (Parada 1) e realiza o merge (D-06, Parada 2) | Branch `main`, releases e aprovações finais                                                                |

---

## 2. Protocolo de Sessão (7 Etapas e 2 Paradas Obrigatórias)

Execução estrita de [`docs/specs/07-protocolo-dos-agentes.md`](docs/specs/07-protocolo-dos-agentes.md):

1. **Contextualizar:** Leia [`.agents/memory/PROGRESS.md`](.agents/memory/PROGRESS.md) (estado atual), [`.agents/memory/DECISIONS.md`](.agents/memory/DECISIONS.md) e o brief do sprint em `docs/sprints/`.
2. **Planejar:** Raciocine a implementação completa dentro do **blast radius fechado**. Salve obrigatoriamente o plano em `docs/agents-plans/plan-f<n>s<nn>-<slug>.md` (caminhos relativos à raiz).
3. **Autorizar ⏸ (PARADA 1):** Apresente o plano ao dono e **espere aprovação explícita** antes de escrever código.
4. **Implementar:** Escreva código e testes juntos, estritamente nos arquivos autorizados pelo brief.
5. **Validar:** Execute os 6 portões do DoD (veja abaixo). Falhou, corrija antes de prosseguir.
6. **Entregar:** Crie branch `feature/*` a partir de `develop`, comite com Conventional Commits, envie via `git push`, abra PR com `gh pr create` e acompanhe via `gh run watch`.
7. **Registrar ⏸ (PARADA 2):** Atualize `DECISIONS.md` (se houver novo ADR), `PROGRESS.md` e crie `.agents/memory/F<n>-S<nn>.md` no mesmo PR. **PARE.** O merge é exclusivo do dono (D-06); não inicie o próximo sprint.

---

## 3. Invariantes Técnicas e Hard Guardrails

- **Blast Radius Fechado:** Proibido alterar ou criar arquivos fora do escopo do brief sem autorização prévia.
- **Tipagem Estrita (TS / ESM):** Proibição absoluta de `any` (use `unknown` + type guards). Imports relativos exigem extensão `.js`. Sem `interface` manual para DTOs (use `z.infer<typeof schema>`).
- **Isolamento de Variáveis e Logs:** Proibido acessar `process.env` fora de `src/config/env.ts`. Proibido `console.*` (utilize `request.log.*` ou `fastify.log.*`).
- **Arquitetura em Camadas:** `routes` (FastifyPluginAsyncZod + delegação) → `services` (regras puras, sem request/reply, lançam `AppError`) → `repositories` (Drizzle/SQL exclusivo).
- **Autorização e Resposta Neutra (D-31):** Recurso pertencente a outro usuário responde `NotFoundError` (HTTP 404), nunca 403, prevenindo enumeração de IDs.
- **Segurança do Agente:** A política em `scripts/agent-security/policy.sh` bloqueia comandos destrutivos, force push (`--force`), bypass de hooks (`--no-verify`) e leitura de segredos. Nunca tente contorná-la.
- **Ambiguidade:** Spec omissa, conflitante ou brief incompleto? **Pare e pergunte.** Nunca invente contratos (spec `07` §3).

---

## 4. Portões de Validação (Definition of Done)

Antes de abrir o PR ou declarar trabalho concluído, todos os 6 comandos da pipeline de CI devem passar com sucesso:

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build && pnpm openapi:check
```

- **Unitários:** `pnpm vitest run --project unit` (stubs em memória, sem banco).
- **Integração:** `pnpm vitest run --project integration` (PostgreSQL efêmero via Testcontainers).
- **E2E:** `pnpm vitest run --project e2e` (`app.inject()`, isolamento de tenants e fluxos HTTP).

---

## 5. Mapa Operacional de Recursos (`.agents/`)

Consulte as regras contextuais e delegue quando necessário aos subagentes e skills:

| Domínio        | Caminho                                              | Conteúdo / Finalidade                                                                     |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Memória**    | [`.agents/memory/`](.agents/memory/)                 | `PROGRESS.md` (leia primeiro), `DECISIONS.md` (ADRs D-01…D-73)                            |
| **Regras**     | [`.agents/rules/`](.agents/rules/)                   | `architecture.md`, `coding-standards.md`, `database.md`, `auth.md`, `testing.md`          |
| **Subagentes** | [`.agents/agents/`](.agents/agents/)                 | `backend-architect`, `db-specialist`, `api-developer`, `qa-engineer`, `security-reviewer` |
| **Skills**     | [`.agents/skills/`](.agents/skills/)                 | `code-quality`, `db-migrate`, `db-seed`, `test-runner`, `grill-me`                        |
| **MCPs**       | [`.agents/mcp_config.json`](.agents/mcp_config.json) | `context7` (documentação oficial), `github` (PRs/issues), `postgres` (introspecção)       |

---

## 6. Padrão de Resposta do Agente

1. **Direto ao ponto:** Sem introduções genéricas, preâmbulos ou saudações prolixas.
2. **Código completo:** Nunca use comentários evasivos (`// ... resto do código`). Forneça implementações funcionais e completas.
3. **Links e rastreabilidade:** Cite caminhos e símbolos em Markdown utilizando o esquema `file://`.
4. **Causa raiz:** Em depurações, aponte a camada exata da falha e aplique correção cirúrgica.
5. **Persistência de planos:** Todo plano de execução gerado na sessão deve ser espelhado em `docs/agents-plans/plan-f<n>s<nn>-<slug>.md` (caminho relativo).

---

## 7. Compilação das Specs (`docs/specs/`)

Especificações normativas do projeto. Em caso de conflito, a spec mais específica ou recente prevalece (ex: `08` substitui trechos da `04`):

| Spec   | Arquivo                                                                       | Escopo Normativo e Diretrizes Chave                                                                                   |
| ------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **00** | [`00-visao-geral.md`](docs/specs/00-visao-geral.md)                           | Visão do produto, MVP para app Flutter de streaming, seed local SoundHelix (sem Spotify).                             |
| **01** | [`01-arquitetura.md`](docs/specs/01-arquitetura.md)                           | Clean Architecture em camadas unidirecionais (`routes` → `services` → `repositories`), RFC 7807 e boundaries no lint. |
| **02** | [`02-modelo-de-dados.md`](docs/specs/02-modelo-de-dados.md)                   | Schema Drizzle/PostgreSQL 17, 9 tabelas normativas, UUIDs de domínio vs texto do Better Auth, PKs compostas.          |
| **03** | [`03-contrato-da-api.md`](docs/specs/03-contrato-da-api.md)                   | Endpoints REST `/api/v1/*` (`/api/auth/*` sem versão), paginação com `{ data, meta }`, 404 neutro sem 403 (D-31).     |
| **04** | [`04-autenticacao-e-seguranca.md`](docs/specs/04-autenticacao-e-seguranca.md) | Better Auth em `auth.config.ts`, drizzleAdapter, sessão por cookie + Bearer (D-13), decorators e guards.              |
| **05** | [`05-testes-e-qualidade.md`](docs/specs/05-testes-e-qualidade.md)             | Pirâmide Vitest (Unit, Integration via Testcontainers, E2E via `app.inject()`), casos nominais obrigatórios (D-27).   |
| **06** | [`06-git-ci-cd-e-deploy.md`](docs/specs/06-git-ci-cd-e-deploy.md)             | Git Flow, Conventional Commits, template de PR, pipeline do GitHub Actions e protocolo de CI vermelho.                |
| **07** | [`07-protocolo-dos-agentes.md`](docs/specs/07-protocolo-dos-agentes.md)       | Protocolo operacional dos agentes (7 etapas, 2 paradas obrigatórias, blast radius fechado, plano persistido).         |
| **08** | [`08-blindagem-de-seguranca.md`](docs/specs/08-blindagem-de-seguranca.md)     | Hardening e fechamento dos 27 GAPs de auth, proxy trust restrito (D-50), rate limit em banco. Prevalece sobre a `04`. |
