# 00 — Visão Geral do Produto

> **Fonte de verdade do escopo.** Qualquer coisa que não esteja aqui ou nas specs `01`–`07`
> está **fora do MVP**. Se um sprint parecer exigir algo não especificado, o agente **para
> e pergunta** — não improvisa.

---

## 1. O que é

API RESTful que serve um catálogo musical fictício para um **app Flutter de streaming**
(MVP acadêmico / portfólio). O app é o único cliente.

**Não há integração com Spotify.** O catálogo vive no banco próprio, populado por um seed
local com áudios públicos do SoundHelix. Essa decisão é definitiva e existe para evitar as
restrições de quota do Spotify Developer Mode.

---

## 2. Capacidades do MVP

| #   | Capacidade                                                          | Autenticado |
| --- | ------------------------------------------------------------------- | ----------- |
| C1  | Listar e buscar faixas, com paginação e filtro por gênero e artista | ❌          |
| C2  | Ver o detalhe de uma faixa, com o artista embutido                  | ❌          |
| C3  | Listar artistas e ver um artista com suas faixas                    | ❌          |
| C4  | Listar os gêneros disponíveis no catálogo                           | ❌          |
| C5  | Cadastrar-se e autenticar-se com e-mail e senha                     | ❌          |
| C6  | Ler, atualizar e excluir o próprio perfil                           | ✅          |
| C7  | Criar, renomear e excluir playlists próprias                        | ✅          |
| C8  | Adicionar e remover faixas de uma playlist própria                  | ✅          |
| C9  | Favoritar e desfavoritar faixas, e listar os favoritos              | ✅          |
| C10 | Consumir a documentação OpenAPI interativa                          | ❌          |

---

## 3. Fora de escopo — explicitamente

Estas ausências são **decisões**, não esquecimentos. Não implemente nenhuma delas sem uma
nova rodada de spec.

| Fora                                                                 | Por quê                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| Integração com Spotify ou qualquer catálogo de terceiros             | Quota do Developer Mode inviabiliza                   |
| Escrita no catálogo pela API (`POST/PATCH/DELETE` em tracks/artists) | Catálogo é read-only, mutável só por seed — **D-09**  |
| RBAC, coluna `role`, painel administrativo                           | Consequência direta de D-09                           |
| Endpoint de streaming, proxy de áudio, URL assinada                  | `audioUrl` vai direto no payload — **D-10**           |
| Contador de reproduções, histórico de escuta, "tocadas recentemente" | **D-10**                                              |
| Reordenar faixas dentro da playlist (`position`)                     | Ordem é `added_at` — **D-15**                         |
| Playlists públicas ou compartilháveis                                | Toda playlist é privada do dono — **D-15**            |
| Tabelas `albums` e `genres` normalizadas                             | `album` e `genre` são colunas em `tracks` — **D-12**  |
| ~~OAuth social, verificação de e-mail, recuperação de senha~~        | **Entrou em F3-S03** — spec `04` §1.1 e §1.2          |
| Troca de senha com o usuário logado, 2FA, magic link                 | Fora mesmo depois de F3-S03                           |
| Upload de arquivos (avatar, capa)                                    | URLs externas apenas                                  |
| Playwright, testes de browser                                        | E2E é `app.inject()` — **D-03**                       |
| Neon, driver serverless, WebSocket                                   | Postgres é Docker local e Railway — **D-04**          |
| Jobs em background (`src/jobs/runner.ts`)                            | Nenhum job necessário no MVP; arquivo permanece vazio |

---

## 4. Stack fechada

| Camada      | Escolha                                                  | Trava                                                          |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Runtime     | **Node.js 24 LTS**                                       | `.nvmrc`, `engines`, Dockerfile e CI usam 24                   |
| Linguagem   | TypeScript 5.7 strict, ESM nativo, `NodeNext`            | `any` proibido                                                 |
| Framework   | Fastify 5 (`^5.8.5`)                                     | `FastifyPluginAsyncZod` obrigatório em rotas                   |
| Validação   | **Zod 4** (`^4.4.3`) + `fastify-type-provider-zod` 6     | AGENTS.md dizia v3 — **corrigido**, escreva Zod 4              |
| Banco       | **PostgreSQL 17**                                        | `postgres:17-alpine` no compose, mesma major no Testcontainers |
| ORM         | Drizzle ORM `0.45.x` + Drizzle Kit `0.31.x`              | Não migrar para 1.0 (RC)                                       |
| Auth        | Better Auth `^1.7.2` com `drizzleAdapter`                | Plugin `bearer` habilitado — **D-13**                          |
| Gerenciador | pnpm 11.25.0                                             | Pinado em `packageManager`                                     |
| Testes      | Vitest 2 + `@testcontainers/postgresql` + `app.inject()` | Sem Playwright                                                 |
| Build       | tsup                                                     | Saída ESM em `dist/`                                           |
| Deploy      | Railway                                                  | `railway.json` + `deploy.yml`                                  |

---

## 5. Domínio em uma frase

Um **usuário** autenticado monta **playlists** e marca **favoritos** sobre um catálogo
fixo de **faixas**, cada uma pertencente a um **artista** e classificada por um **gênero**.

```
user ──< playlists ──< playlist_tracks >── tracks >── artists
  └──< favorites ──────────────────────────┘
```

---

## 6. Volume do catálogo (seed)

**8 artistas · 40 faixas · 6 gêneros** — **D-28**.

- Gêneros (slug ASCII, minúsculo): `rock`, `pop`, `electronic`, `hip-hop`, `jazz`, `lo-fi`.
- 5 faixas por artista, distribuídas de forma que **todo gênero tenha ≥ 5 faixas**.
- O SoundHelix publica apenas **~16 URLs de áudio distintas**
  (`https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3` … `-16.mp3`).
  Com 40 faixas o áudio **repete** — isso é aceito e esperado. Os metadados
  (título, álbum, gênero, duração, capa) é que devem ser únicos e plausíveis.
- O seed é **idempotente**: rodar duas vezes não duplica nem falha (ver `05` e `02`).

---

## 7. Glossário

| Termo            | Significado neste projeto                                                       |
| ---------------- | ------------------------------------------------------------------------------- |
| **Fase**         | Bloco de sprints que termina em uma tag `vX.Y.0`. São 5.                        |
| **Sprint**       | Uma sessão de agente = um PR = um módulo ou camada completa. São 18.            |
| **Módulo**       | Pasta em `src/modules/<dominio>/` com routes + service + repository + schema    |
| **Envelope**     | Formato fixo de resposta: `{ data, meta }` em listas, objeto puro em item único |
| **Blast radius** | Lista fechada de arquivos que um sprint pode criar ou editar                    |
| **DoD**          | _Definition of Done_ — a sequência de comandos que prova o sprint concluído     |

---

## 8. Mapa das specs

| Arquivo                          | Responde                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| `00-visao-geral.md`              | O que construímos e o que deliberadamente não construímos           |
| `01-arquitetura.md`              | Como o código se organiza e quais fronteiras não podem ser cruzadas |
| `02-modelo-de-dados.md`          | Toda tabela, coluna, chave, índice e migração                       |
| `03-contrato-da-api.md`          | Toda rota, payload, código de status e erro                         |
| `04-autenticacao-e-seguranca.md` | Better Auth, sessão, guards, CORS, rate limit, logs                 |
| `05-testes-e-qualidade.md`       | Pirâmide, casos obrigatórios, harness, portões de qualidade         |
| `06-git-ci-cd-e-deploy.md`       | Git Flow, commits, CI, releases, Railway                            |
| `07-protocolo-dos-agentes.md`    | Como uma sessão de agente começa, roda e termina                    |
