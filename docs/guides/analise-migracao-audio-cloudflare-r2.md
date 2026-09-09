# GUIA — Validação das sprints e análise para migrar o áudio do catálogo para a Cloudflare R2

> **Natureza deste arquivo:** análise e proposta. **Não é normativo.** Nada aqui autoriza
> execução: as decisões viram ADR em `.agents/memory/DECISIONS.md`, o contrato vira spec em
> `docs/specs/**` e a execução vira sprint em `docs/sprints/**`. Enquanto isso não acontecer,
> vale a cadeia de autoridade do `CLAUDE.md` — este guia é degrau 6, abaixo do `README.md`.
>
> |                    |                                                                   |
> | ------------------ | ----------------------------------------------------------------- |
> | **Data**           | 2026-09-08                                                        |
> | **Base**           | `develop` @ `b9dc3fc`, working tree limpo                         |
> | **Insumos**        | `.agents/memory/PROGRESS.md` · `docs/sprints/**` · handoff R2     |
> | **Handoff origem** | `.claude/memory/handoff-migracao-audio-r2.md` (escrito em F2-S02) |
> | **Autor**          | Claude Code (Opus 5), Staff Engineer do projeto (D-42)            |

---

## 1. Sumário executivo

**As 16 sprints de F1 a F4 estão de fato concluídas.** Rodei os cinco portões agora, nesta
árvore: todos verdes, 264 testes em 28 arquivos, exatamente o número que o `PROGRESS.md`
declara. Não encontrei sprint declarada concluída sem código correspondente.

Encontrei **seis divergências** entre o que os documentos afirmam e o que o repositório é
(§2.3). A mais séria: **não existe nenhuma tag no repositório — nem local, nem no `origin` —
e nenhum GitHub Release.** As fases F1–F4 estão code-complete mas não seladas, o que
contradiz D-08 e a linha "Última tag `v0.4.0` (preparada)" do `PROGRESS.md`.

Sobre a migração para a R2: **o handoff continua correto na decisão e envelheceu no mapa.**
Ele foi escrito quando F2-S02 acabara de mergear; desde então F3 e F4 espalharam referências
ao SoundHelix por mais nove arquivos, incluindo três `*.schema.ts` de módulo (que alimentam o
OpenAPI) e seis arquivos de teste. O blast radius saiu de "14 docs + 2 código" para
**25 arquivos — 15 de documentação e 10 de código/teste** (§3.2). E o ADR livre não é mais
D-41 (ocupado desde F4-S01): é **D-49**.

O handoff também tem uma lacuna que precisa ser fechada antes de qualquer sprint: **ele
pressupõe "ter os 40 arquivos de áudio" sem dizer de onde eles vêm nem sob qual licença**
(§4). Como o catálogo usa nomes de artistas fictícios, hospedar gravação comercial real sob
esses nomes é infração de direito autoral _e_ atribuição falsa. Essa é a questão que trava a
redação da spec, não o domínio do CDN.

**Recomendação de sequência:** provisionar a Cloudflare (trabalho manual do dono, §5) →
uma sprint de migração do catálogo → só então F5-S01, F5-S02 e F5-S03. Migrar **antes** do
F5-S01 porque as strings `.describe()` dos schemas Zod entram no `openapi.json`; migrar
depois obrigaria a regenerar o artefato recém-commitado.

---

## 2. Validação das sprints entregues

### 2.1 Portões executados nesta árvore

Executados em `develop` @ `b9dc3fc`, working tree limpo, Docker ativo:

| Portão    | Comando              | Resultado                                        |
| --------- | -------------------- | ------------------------------------------------ |
| Typecheck | `pnpm typecheck`     | ✅ exit 0, zero erros                            |
| Lint      | `pnpm lint`          | ✅ exit 0, zero violações de `boundaries`        |
| Format    | `prettier . --check` | ✅ "All matched files use Prettier style"        |
| Testes    | `pnpm test`          | ✅ **28 arquivos · 264 testes · 63,65 s**        |
| Build     | `pnpm build`         | ✅ tsup, `dist/server.js` + `dist/db/migrate.js` |

Usei `prettier --check` em vez de `pnpm format` de propósito: `format` **escreve** e, num
passo de validação, mascararia justamente o desvio que se quer detectar. Fica a sugestão de
adicionar um script `format:check` para o CI e para casos como este.

### 2.2 O que confere com o `PROGRESS.md`

- **16 sprints ✅ (F1-S01…F4-S03)** com PR de #1 a #27 — todas têm código real. Nenhuma
  "concluída no papel".
- **264 testes** batem exatamente com o declarado.
- **Arquivos 0 bytes:** exatamente os três esperados — `Dockerfile`, `railway.json`,
  `.github/workflows/deploy.yml` (mais `tests/unit/modules/.gitkeep`, que é intencional).
  Nenhum módulo vazio sobrou.
- **Memórias de sprint:** os 17 arquivos `F<n>-S<nn>.md` existem em `.agents/memory/`.
- **Planos de execução:** 16 planos em `docs/agents-plans/`, um por sprint.
- **`develop` sincronizado com `origin/develop`**, sem divergência.

Contratos verificados por amostragem no código: 20 rotas Fastify explícitas
(`artists` 2 · `tracks` 3 · `users` 3 · `playlists` 7 · `favorites` 3 · `health` 2) mais a
rota coringa única do Better Auth (`method: ['GET','POST','OPTIONS']`, D-45) e o Swagger UI.

### 2.3 Divergências encontradas

| #      | Divergência                                                                                                                                                                                                                                        | Gravidade | Onde corrigir                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| **V1** | **Nenhuma tag existe** — `git tag -l` e `git ls-remote --tags origin` voltam vazios, `gh release list` idem. `v0.1.0`, `v0.2.0`, `v0.3.0` e `v0.4.0` nunca foram criadas. D-08 exige tag + Release fechando cada fase.                             | **alta**  | Decisão do dono: selar as 4 fases retroativamente ou emendar D-08. Bloqueia a narrativa de `v1.0.0`. |
| **V2** | `PROGRESS.md:16` diz "Última tag `v0.4.0` (preparada)". "Preparada" não é "criada" — a linha induz o leitor (e o próximo agente) ao erro de V1.                                                                                                    | média     | `PROGRESS.md`, etapa 7 da próxima sprint                                                             |
| **V3** | `PROGRESS.md:20` ainda aponta "Branch de trabalho: `feature/f4s03-suite-e2e`". Essa branch já mergeou no PR #27; a branch corrente é `develop`.                                                                                                    | baixa     | `PROGRESS.md`                                                                                        |
| **V4** | `docs/sprints/README.md` descreve a entrega de F4-S03 como "E1–E9". Foram entregues **E1–E15** (5 specs), conforme `.agents/memory/F4-S03.md` e o próprio `PROGRESS.md`.                                                                           | baixa     | `docs/sprints/README.md`                                                                             |
| **V5** | `docs/sprints/fase-5-producao/F5-S01-openapi-e-docs.md:38` fala em "as 25 rotas". A superfície real é 20 rotas Fastify + 1 coringa de auth + `/docs`. Os R01–R31 são **contratos**, não registros de rota — os dois números não são a mesma coisa. | baixa     | Ajustar no próprio F5-S01, ao executá-lo                                                             |
| **V6** | `CLAUDE.md:93` manda "promover o handoff ao próximo `D-NN` livre" apontando implicitamente para o D-41 do handoff. **D-41 está ocupado** (projeção com `innerJoin`, F4-S01). O último ADR é **D-48**; o próximo livre é **D-49**.                  | média     | Ao redigir o ADR — ver §7                                                                            |

**Nenhuma dessas divergências invalida uma sprint.** V1 é a única que precisa de decisão do
dono antes do `v1.0.0`; o resto é higiene de documentação que cabe na etapa 7 da próxima
sprint ou na reconciliação de F5-S03.

---

## 3. O handoff da R2, revisto contra o repositório de hoje

A **decisão** do handoff continua válida e não deve ser reaberta: R2 como storage estático
(Caminho A), bucket público sob domínio próprio, API permanece read-only, D-09 e D-10
preservadas, hotlink livre aceito conscientemente. O que envelheceu é o **mapa**.

### 3.1 Pontos do handoff que hoje estão errados

| Ponto do handoff                                                                  | Realidade em `b9dc3fc`                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "nova **D-41**"                                                                   | D-41 é "Projeção estruturada com innerJoin" (F4-S01). Último ADR: **D-48**. Próximo livre: **D-49**.                                                                                       |
| "**14 arquivos** de documentação + 2 de código"                                   | **25 arquivos** citam SoundHelix: **15 de documentação/memória** e **10 de código e teste**.                                                                                               |
| "E14 usa regex de `https://`, genérico demais para quebrar. _Opcional_"           | **Falso hoje.** `catalog-flow.e2e.test.ts:148` faz `expect(track.audioUrl).toContain('SoundHelix')`. **E14 quebra junto com T16** — é obrigatório, não opcional.                           |
| "40 `coverUrl` + 8 `avatarUrl` no Unsplash" (⇒ 48 imagens para migrar)            | São 40 _ocorrências_ de `coverUrl`, mas apenas **8 URLs distintas** (uma por artista, embora existam 16 álbuns) + 8 avatares = **16 imagens distintas**. Migrar capas custa ⅓ do estimado. |
| "`src/config/constants.ts` está fora do blast radius; use `const CDN_BASE` local" | Verdadeiro **para F2-S02**, que está fechada. A sprint nova declara o próprio blast radius e pode incluir `constants.ts` — ver §6.                                                         |
| Consequência "`durationSeconds` volta a ser honesto"                              | Só se as durações forem **recalculadas a partir dos arquivos reais**. O handoff não mapeia isso como trabalho, e é trabalho. Ver §3.3.                                                     |

### 3.2 Blast radius real — os 25 arquivos que citam SoundHelix

Levantado com `git grep -ni soundhelix`. O handoff (`.claude/memory/…`) não entra na conta.

**Código e teste (10) — quebram ou mentem quando a URL mudar:**

| Arquivo                                                  | Ocorr. | O que é                                                     |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `src/db/seed/data/tracks.data.ts`                        | 40     | os 40 `audioUrl` — o alvo real                              |
| `src/modules/tracks/tracks.schema.ts:62`                 | 1      | `.describe('… (SoundHelix)')` — **entra no `openapi.json`** |
| `src/modules/playlists/playlists.schema.ts:85`           | 1      | idem                                                        |
| `src/modules/favorites/favorites.schema.ts:39`           | 1      | idem                                                        |
| `tests/integration/seed.test.ts:104–114`                 | 5      | **T16** — regex do SoundHelix. Quebra primeiro.             |
| `tests/e2e/specs/catalog-flow.e2e.test.ts:148`           | 1      | **E14** — `toContain('SoundHelix')`. Quebra junto.          |
| `tests/unit/modules/artists/artists.service.test.ts`     | 4      | fixtures                                                    |
| `tests/unit/modules/tracks/tracks.service.test.ts`       | 1      | fixture com template literal                                |
| `tests/unit/modules/playlists/playlists.service.test.ts` | 1      | fixture                                                     |
| `tests/unit/modules/favorites/favorites.service.test.ts` | 2      | fixture — inclui um `title: 'SoundHelix Song 1'`            |

> As fixtures unitárias **não quebram** (não há assert sobre o host), mas deixam a marca do
> fornecedor antigo espalhada. Trocá-las é higiene, e é barato fazer junto.

**Documentação e memória (15):**

| Arquivo                                                           | Ocorr. | Tier do handoff                                |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `.agents/memory/DECISIONS.md` (D-10 `:106`, D-28 `:270`)          | 2      | 1                                              |
| `docs/specs/00-visao-geral.md` (`:15`, `:97–98`)                  | 3      | 2                                              |
| `docs/specs/03-contrato-da-api.md:141`                            | 1      | 2                                              |
| `docs/sprints/fase-2-catalogo/F2-S02-*.md` (`:170`,`:172`,`:249`) | 3      | 3                                              |
| `docs/agents-plans/plan-f2-s02-*.md`                              | 42     | 5 — **regerar**                                |
| `docs/agents-plans/plan-f2-s04-modulo-tracks.md`                  | 1      | novo                                           |
| `docs/agents-plans/plan-f4-s03-suite-e2e.md`                      | 1      | novo                                           |
| `.agents/memory/F2-S02.md` (`:73`, `:96`)                         | 2      | novo                                           |
| `.agents/memory/F4-S03.md` (`:37`, `:115`)                        | 2      | novo                                           |
| `.agents/rules/database.md:23`                                    | 1      | 4 (+ dívida "30+")                             |
| `.agents/skills/db-seed/SKILL.md:33`                              | 1      | 4 (+ dívida "30+")                             |
| `.agents/agents/db-specialist.md:35`                              | 1      | 4 (+ dívida "30+")                             |
| `README.md` (`:122`, `:268`)                                      | 2      | 4 (+ dívida "30+/5–8")                         |
| `AGENTS.md:153`                                                   | 1      | 4                                              |
| `CLAUDE.md` (`:91`, `:93`)                                        | 2      | novo — o bloco "Open" sai quando o ADR existir |

**Sobre as memórias de sprint fechada** (`F2-S02.md`, `F4-S03.md`, `plan-f2-s02-*.md`): elas
**registram o passado**. Reescrevê-las apaga história. A regra que proponho para a sprint:
**não editar o corpo; acrescentar uma nota de rodapé** apontando para o ADR novo
("`audioUrl` migrado em D-49, sprint X"). O `plan-f2-s02-*.md`, que o handoff mandava
regerar, entra na mesma regra — regerar um plano de execução de sprint fechada é falsificar
o registro, não corrigi-lo.

### 3.3 Consequência que o handoff não mapeia: as durações

`tests/integration/seed.test.ts` (**T17**) exige `120 ≤ durationSeconds ≤ 380` para as 40
faixas. Os valores atuais vão de **140 a 345** — foram inventados junto com os metadados,
porque com o SoundHelix não havia nada a que corresponder.

Com áudio real, `durationSeconds` passa a ser **verificável**: um cliente Flutter que confia
nesse número e recebe um arquivo de outro tamanho mostra barra de progresso errada. Logo, a
sprint precisa **derivar as 40 durações dos arquivos** (`ffprobe -v error -show_entries
format=duration -of csv=p=0 arquivo.mp3`, arredondando para inteiro) e substituí-las no
`tracks.data.ts`.

Isso vira **critério de seleção do acervo**: escolher faixas com duração entre **2 min e
6 min 20 s** mantém T17 intacto. Se alguma faixa desejada ficar fora, é T17 que muda — e aí
a mudança tem que estar declarada no brief, não descoberta pelo agente no meio da execução.

---

## 4. A lacuna que trava tudo: de onde vêm as "músicas reais"

O handoff termina em "Pré-requisito: ter os 40 arquivos de áudio". **Esse pré-requisito é o
problema difícil, e ele é jurídico, não técnico.**

### 4.1 O risco concreto

O catálogo tem oito artistas **fictícios** (Aurora Avenue, Lunar Echoes, Velvet Horizon,
The Solar Waves, Neon Mirage, Dusty Grooves, Echoes of Orion, Quantum Drift) e 40 títulos
igualmente fictícios. Subir gravação comercial real sob esses nomes num bucket **público**
soma duas coisas:

1. **reprodução e distribuição não autorizada** de obra protegida — é o ato, não a
   intenção, que caracteriza; "é portfólio" não é defesa; e
2. **atribuição falsa** — a faixa é creditada a um artista que não a fez.

Bucket público, indexável, sob domínio próprio ligado a uma conta nominal, com o repositório
**público** no GitHub apontando para ele. O vetor de reclamação é trivial.

### 4.2 O que é seguro

| Fonte                            | Licença típica         | Serve?                                                                                                                      |
| -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Composição própria**           | sua                    | ✅ ideal — zero atrito, zero atribuição, catálogo 100 % autocontido                                                         |
| **Free Music Archive**           | CC0 / CC-BY / CC-BY-SA | ✅ com ressalva: filtrar por licença, CC-BY exige crédito                                                                   |
| **Musopen**                      | domínio público        | ✅ gravações de clássico em DP — mas não cobre `hip-hop`/`lo-fi`                                                            |
| **Internet Archive** (netlabels) | varia por item         | ✅ item a item, conferindo cada licença                                                                                     |
| **Pixabay / Uppbeat / Mixkit**   | licença própria        | ⚠️ costuma proibir redistribuição do arquivo bruto — que é exatamente o que um bucket público faz. **Ler os termos antes.** |
| **Jamendo**                      | CC, várias             | ✅ para uso não comercial, respeitando a variante de cada faixa                                                             |
| **Qualquer catálogo comercial**  | —                      | ❌ não                                                                                                                      |

**Recomendação:** CC0 / domínio público como padrão, CC-BY como exceção consciente. CC0
elimina a obrigação de crédito e mantém o catálogo autocontido, que era o argumento
original a favor da R2.

### 4.3 A pergunta de escopo que sai daqui

Se entrar qualquer faixa **CC-BY** (ou CC-BY-SA), o crédito passa a ser **obrigação legal**,
não cortesia. E aí vem uma decisão de arquitetura de verdade:

- **Opção 1 — crédito só no repositório.** Um `docs/creditos-do-catalogo.md` com as 40
  linhas (título, autor real, fonte, licença, URL) e uma seção no `README.md`.
  Custo: zero de schema, zero de contrato, zero de migração. Fraqueza: o crédito não chega
  ao usuário do app Flutter, que é onde a licença espera que ele apareça.
- **Opção 2 — crédito no contrato.** Colunas novas em `tracks` (`license`, `attribution`,
  `sourceUrl`), migração, campos novos no payload `Track`, ajuste em `03-contrato-da-api.md`,
  `openapi.json` e nos três `*.schema.ts`. Custo alto, e mexe no contrato **na véspera do
  deploy**. Não viola D-09 (segue read-only, populado por seed), mas é mudança de contrato e
  exige o ritual de decisão do `CLAUDE.md` §Mode of operation.

**Recomendo Opção 1 + acervo CC0 sempre que possível**, exatamente para não precisar da
Opção 2 antes do `v1.0.0`. Se o dono quiser a Opção 2, ela é **fase própria**, não um item
enxertado nesta sprint.

---

## 5. Cloudflare R2 — o que precisa existir antes de qualquer sprint

Isto é **trabalho manual do dono**. Nenhum agente cria conta, valida domínio ou emite token.
O produto desta seção é um pré-requisito (chamo de **P0**), não uma sprint.

### 5.1 Sequência de provisionamento

| Passo | O que fazer                                                                                                                                                                         | Resulta em                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| P0.1  | Conta Cloudflare + **um domínio cujo DNS esteja na Cloudflare**. Sem zona na Cloudflare não há custom domain para o bucket.                                                         | `<dominio>` ativo, nameservers apontados |
| P0.2  | R2 → **Create bucket**. Nome sugerido `cardoso-sound-media`. Região: `auto` (ou `eeur`/`wnam` se quiser fixar).                                                                     | bucket criado                            |
| P0.3  | Anotar o **Account ID** (endpoint S3: `https://<account_id>.r2.cloudflarestorage.com`).                                                                                             | endpoint                                 |
| P0.4  | Bucket → Settings → **Public access → Connect Custom Domain** → `cdn.<dominio>`. **Não usar `*.r2.dev`**: é rate-limited e a própria Cloudflare desaconselha em produção.           | `https://cdn.<dominio>` servindo         |
| P0.5  | R2 → **Manage API Tokens** → token de **Object Read & Write** com escopo _apenas neste bucket_. Guarda o **Access Key ID** e o **Secret Access Key** (o secret aparece uma vez só). | credencial S3-compatível                 |
| P0.6  | Reunir os 40 arquivos `.mp3`, já resolvida a questão de licença (§4). Normalizar: MP3 CBR 128–192 kbps, 44,1 kHz, tags ID3 limpas. Renomear pelo slug (§6.2).                       | `./audio/*.mp3`                          |
| P0.7  | `ffprobe` em cada arquivo → tabela `slug → duração inteira em segundos`. Insumo obrigatório do passo de código (§3.3).                                                              | as 40 durações reais                     |
| P0.8  | Upload com os **dois headers** (§5.2).                                                                                                                                              | objetos no bucket                        |
| P0.9  | Verificação manual: `curl -I` em 3 URLs → `200`, `content-type: audio/mpeg`, `accept-ranges: bytes`.                                                                                | prova de que o CDN serve                 |
| P0.10 | **CORS**: só configurar se o cliente Flutter for rodar em **Web**. App nativo ignora CORS. Se for Web: permitir a origem do app, métodos `GET, HEAD`, header `Range`.               | (condicional)                            |

### 5.2 Upload — os headers não são detalhe

```bash
# rclone (R2 é S3-compatible). Config: provider Cloudflare, endpoint do P0.3,
# access_key_id / secret_access_key do P0.5.
rclone copy ./audio r2:cardoso-sound-media/tracks \
  --header-upload "Content-Type: audio/mpeg" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
```

Alternativa oficial, sem rclone:

```bash
npx wrangler r2 object put cardoso-sound-media/tracks/<slug>.mp3 \
  --file ./audio/<slug>.mp3 \
  --content-type audio/mpeg \
  --cache-control "public, max-age=31536000, immutable"
```

- Sem `Content-Type: audio/mpeg` o R2 entrega `application/octet-stream` e parte dos players
  (incluindo o `just_audio` em alguns cenários) engasga.
- `max-age` de um ano só é seguro porque **o nome do objeto é imutável**: áudio novo ⇒ slug
  novo. Essa é a regra que sustenta o cache — precisa estar escrita na spec, não só aqui.
- **Range requests** o R2 atende nativamente; é o que faz o _seek_ funcionar. Nada a
  configurar, mas vale como caso de teste manual (`curl -r 0-1023 -I`).

### 5.3 Custo

40 faixas × ~5 MB ≈ **200 MB** de 10 GB gratuitos. Egress da R2 é **zero**. Classe A
(escritas) e Classe B (leituras) ficam ordens de grandeza abaixo do free tier para um
portfólio. **Custo esperado: US$ 0.** O que pode custar é o domínio, se ainda não existir.

---

## 6. Variáveis de ambiente e configuração

### 6.1 O ponto contraintuitivo: **a API não precisa de nenhum segredo da Cloudflare**

No Caminho A a API **nunca fala com a R2**. Ela devolve uma string que já está no banco; o
Flutter baixa direto do CDN. Portanto:

| Item                                          | Onde vive                                             | Vai para o repo? | Vai para a Railway? |
| --------------------------------------------- | ----------------------------------------------------- | ---------------- | ------------------- |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`   | `~/.config/rclone/rclone.conf` **da máquina do dono** | **não**          | **não**             |
| Account ID / endpoint S3                      | idem                                                  | não              | não                 |
| Base pública do CDN (`https://cdn.<dominio>`) | `src/config/constants.ts` — ver §6.2                  | **sim**          | não precisa         |

Isso é uma propriedade boa e vale escrever no ADR: **a migração não adiciona um único segredo
à superfície de produção.** Se um dia o upload for para o CI, aí sim entram dois GitHub
Secrets — e isso é outra decisão.

### 6.2 Onde mora a base do CDN — três opções

| Opção                                                                        | A favor                                                                                                                         | Contra                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** `const CDN_BASE` local em `tracks.data.ts` (o que o handoff propunha) | Blast radius mínimo                                                                                                             | Duplica a constante quando as capas migrarem (`artists.data.ts`); testes precisam repetir o literal                                                     |
| **B.** `CDN_BASE_URL` em `src/config/constants.ts` — **recomendado**         | Já é a casa de `GENRES`, `API_PREFIX`, limites; um ponto de troca; testes importam em vez de repetir literal; sem `process.env` | Toca um arquivo a mais — irrelevante numa sprint que declara o próprio blast radius                                                                     |
| **C.** `CDN_BASE_URL` em `src/config/env.ts`                                 | Permitiria bucket diferente por ambiente                                                                                        | **Rejeitar**: existe um bucket só; tornaria o seed dependente do ambiente e os testes não-determinísticos, contrariando "seed offline e determinístico" |

**Recomendação: B.** É valor **público** e determinístico, não segredo, e não varia por
ambiente — logo é constante, não variável de ambiente. `.env.example` **não muda**.

### 6.3 Convenção de nome do objeto (proposta normativa)

```
https://cdn.<dominio>/tracks/<artist-slug>--<title-slug>.mp3
```

Exemplo: `https://cdn.<dominio>/tracks/aurora-avenue--midnight-overdrive.mp3`

Justificativa do `<artist-slug>--`: a unicidade no banco é
`UNIQUE (artist_id, title)`, **não** `UNIQUE (title)`. Hoje os 40 títulos são globalmente
únicos e ASCII puro, então `<title-slug>.mp3` funcionaria — mas o dia em que duas faixas de
artistas diferentes compartilharem título, o slug flat colide silenciosamente e uma faixa
sobrescreve a outra no bucket. O prefixo do artista faz o namespace do CDN espelhar
exatamente a constraint do banco.

Regra de slug: minúsculas, ASCII, não-alfanumérico → `-`, hifens colapsados, sem hífen nas
pontas. Determinístico e reversível de olho.

Comprimento: `https://cdn.<dominio>/tracks/aurora-avenue--midnight-overdrive.mp3` ≈ 70–90
chars. `audio_url varchar(500)` comporta com folga — **schema não muda** (confirmado em
`src/db/schema/tracks.schema.ts:16`).

---

## 7. Decisões a registrar (ADRs)

Último ADR: **D-48**. As novas entram a partir de **D-49**.

| ADR                      | Título proposto                                     | Conteúdo essencial                                                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-49** _(novo)_        | Áudio próprio em Cloudflare R2 sob domínio dedicado | Caminho A: R2 é só storage, upload manual, seed grava URL estática. **Preserva D-09** (catálogo read-only) e **D-10** (sem streaming, sem URL assinada). Base pública em `constants.ts`, não em `env.ts`. **Consequência aceita: hotlink livre** — a defesa violaria D-10. **Consequência: zero segredo novo em produção.** |
| **D-50** _(novo)_        | Licenciamento do acervo de áudio                    | Só CC0 / domínio público / CC-BY. Manifesto de créditos em `docs/`, **fora** do contrato da API (Opção 1 do §4.3). Fecha a porta para gravação comercial sob nome de artista fictício.                                                                                                                                      |
| **D-51** _(condicional)_ | Capas e avatares: migram ou ficam                   | Só existe se a resposta à Q2 (§10) for "migram". 16 imagens distintas, mesma convenção de slug em `covers/` e `artists/`.                                                                                                                                                                                                   |
| **D-10** _(emenda)_      | Trocar o host na _Decisão_                          | "toca direto do SoundHelix" → "toca direto do CDN próprio (D-49)". A decisão em si — sem `/stream`, sem contador — **não muda**.                                                                                                                                                                                            |
| **D-28** _(emenda)_      | Reescrever só a _Consequência_                      | A _Decisão_ (8/40/6, ≥5 por gênero, idempotência) **permanece**. Some o parágrafo das "~16 URLs distintas / o áudio repete", que deixa de ser verdade. Apontar para D-49. **Preservar o histórico: emendar, não apagar.**                                                                                                   |

E, fora do escopo desta feature mas exigido por V1:

| ADR                        | Assunto                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **D-52** _(se necessário)_ | O que fazer com as tags ausentes de F1–F4: selar retroativamente `v0.1.0`…`v0.4.0` ou emendar D-08 para "só `v1.0.0` é tag real". |

---

## 8. Spec nova proposta — `docs/specs/08-midia-e-cdn.md`

Hoje as regras de mídia estão espalhadas: `00` §6 fala de volume, `02` §142 do
`varchar(500)`, `03` §141 do exemplo do payload. Nenhuma delas é **a** spec de mídia — e a
migração cria regras que não têm casa (slug, headers, cache, licença, verificação).

Proponho a spec **`08-midia-e-cdn.md`**, em PT-BR (D-25), com este índice:

1. **Escopo** — o que é mídia neste projeto (áudio, capa, avatar) e o que a API faz com ela
   (nada além de devolver a URL — D-10).
2. **Topologia do bucket** — `tracks/`, e `covers/`/`artists/` se a Q2 disser que migram.
3. **Convenção de nome** — a regra de slug do §6.3, com exemplos e a justificativa da
   colisão `(artist_id, title)`.
4. **Imutabilidade** — objeto nunca é sobrescrito; áudio novo = slug novo. É o que autoriza
   `max-age=31536000, immutable`.
5. **Headers obrigatórios no upload** — `Content-Type`, `Cache-Control`, e por quê.
6. **Range requests** — suportados nativamente; requisito do _seek_ do `just_audio`.
7. **CORS** — condicional a Flutter Web; nativo dispensa.
8. **Licenciamento** — o que pode entrar no acervo (D-50) e onde o crédito vive.
9. **Domínio e DNS** — custom domain obrigatório, `r2.dev` proibido em produção.
10. **Verificação** — o procedimento de `HEAD` nas 40 URLs e por que ele **não** roda no CI.
11. **Segredos** — quais existem, onde vivem, e a afirmação de que nenhum entra em produção.
12. **Fora de escopo** — upload pela API, presigned URL, transcodificação, HLS, contador de
    reprodução (D-09, D-10).

Impacto nas specs existentes (deltas, não reescritas):

| Spec                           | Delta                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `00-visao-geral.md:15`         | "áudios públicos do SoundHelix" → "acervo próprio no CDN (D-49)". O motivo da frase (fugir da quota do Spotify) **continua válido** e fica. |
| `00-visao-geral.md:96–99`      | O bullet das ~16 URLs e da repetição **sai inteiro** → entra a convenção de slug, com ponteiro para a `08`.                                 |
| `03-contrato-da-api.md:141`    | Exemplo do payload `Track` → URL do CDN.                                                                                                    |
| `02-modelo-de-dados.md:142`    | **Não muda** — `varchar(500)` comporta (reconferido).                                                                                       |
| `05-testes-e-qualidade.md:101` | **Não muda** — trata de UNIQUE/idempotência.                                                                                                |
| `05-testes-e-qualidade.md`     | _Acrescentar_ uma linha: a verificação de CDN é manual e **não** entra no CI (testes são offline).                                          |
| `06-git-ci-cd-e-deploy.md` §7  | **Não muda** — nenhuma variável nova na Railway.                                                                                            |

---

## 9. Sprints propostas

### 9.1 Estrutura recomendada: 1 pré-requisito + 1 sprint (+1 condicional)

| Unidade                          | Executa    | Natureza                                    | Entrega                                                                    |
| -------------------------------- | ---------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| **P0 — Provisionamento**         | **o dono** | Runbook manual (§5). Não é sprint de agente | Bucket no ar, `cdn.<dominio>` servindo, 40 objetos, tabela de durações     |
| **Sprint 1 — Migração do áudio** | agente     | Cascata Tier 1→5 + código + testes          | D-49/D-50, spec `08`, deltas de spec, `tracks.data.ts`, T16, E14, fixtures |
| **Sprint 2 — Capas e avatares**  | agente     | **Condicional** à resposta da Q2            | D-51, 16 imagens, `coverUrl`/`avatarUrl`, spec `08` §2                     |

Fundir a Sprint 2 na Sprint 1 é possível, mas dobra o blast radius de uma sprint que já toca
25 arquivos. **Recomendo separar** — e, se as capas ficarem no Unsplash, a Sprint 2
simplesmente não existe.

### 9.2 Numeração — decisão do dono (Q4 do §10)

Nenhum ADR cobre "onde encaixar sprint de follow-up numa fase declarada concluída". As
opções, com custo real:

| Opção                                        | A favor                                                                                                                                    | Contra                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F2-S05** — _recomendada_                   | Domínio correto (é catálogo/seed); número livre; **zero renumeração**; a tag `v0.2.0` nunca foi cortada (V1), então nada selado é reaberto | Acrescenta linha a uma fase marcada ✅ — resolve-se com a nota "sprint de follow-up" na tabela                                                              |
| **F5-S00**                                   | Sinaliza "antes de tudo em F5"                                                                                                             | Índice zero é convenção nova no projeto; e o trabalho não é de produção, é de catálogo                                                                      |
| **Inserir como F5-S01 e empurrar as demais** | Ordem de leitura perfeita                                                                                                                  | **Rejeitar**: 19 arquivos citam `F5-S01/02/03`, incluindo memórias de sprint **fechada** (`F1-S04.md`, `F4-S03.md`). Renumerar reescreve registro histórico |

**Recomendo `F2-S05` (+ `F2-S06` se as capas migrarem)**, executadas fora de ordem numérica,
com a dependência declarada explicitamente no grafo do `docs/sprints/README.md`:

```
F4-S03 ──▶ F2-S05 (áudio no CDN) ──▶ [F2-S06 capas] ──▶ F5-S01 ──▶ F5-S02 ──▶ F5-S03
```

### 9.3 Esqueleto da Sprint 1 (anatomia D-30)

O arquivo real precisa dos onze blocos de D-30 na ordem. O que segue é o miolo que só eu
posso preencher agora — o resto é forma.

**Objetivo.** Trocar a origem do áudio das 40 faixas do seed do SoundHelix para o CDN
próprio na Cloudflare R2, propagando a mudança pela cascata Decisões → Specs → Sprints →
Docs de agente → Código, e tornando `durationSeconds` verificável.

**Specs obrigatórias.** `08-midia-e-cdn.md` (nova, escrita nesta sprint), `00` §6, `03` §
`Track`, `05` §idempotência, D-09, D-10, D-28, D-49, D-50.

**Contratos esperados.**

```ts
// src/config/constants.ts
export const CDN_BASE_URL = 'https://cdn.<dominio>';

// src/db/seed/data/tracks.data.ts — 40 entradas, audioUrl por template literal
audioUrl: `${CDN_BASE_URL}/tracks/aurora-avenue--midnight-overdrive.mp3`,
durationSeconds: 217, // valor de ffprobe, não inventado
```

Interface `SeedTrack` **inalterada**. Schema Drizzle **inalterado**. Payload da API
**inalterado**. Nenhuma migração nova.

**Blast radius fechado.**

_Criar:_ `docs/specs/08-midia-e-cdn.md` · `docs/creditos-do-catalogo.md` ·
`scripts/verify-media-urls.ts` (se a Q3 disser que sim).

_Editar:_ `.agents/memory/DECISIONS.md` (D-49, D-50, emendas a D-10 e D-28) ·
`docs/specs/00-visao-geral.md` · `docs/specs/03-contrato-da-api.md` ·
`docs/specs/05-testes-e-qualidade.md` · `docs/sprints/fase-2-catalogo/F2-S02-*.md` ·
`docs/sprints/fase-5-producao/F5-S03-*.md` (linha 133, acrescentar SoundHelix aos suspeitos
da reconciliação) · `docs/sprints/README.md` · `src/config/constants.ts` ·
`src/db/seed/data/tracks.data.ts` · `src/modules/{tracks,playlists,favorites}/*.schema.ts`
(só a string do `.describe()`) · `tests/integration/seed.test.ts` (T16, T17) ·
`tests/e2e/specs/catalog-flow.e2e.test.ts` (E14) · as 4 fixtures unitárias ·
`.agents/rules/database.md` · `.agents/skills/db-seed/SKILL.md` ·
`.agents/agents/db-specialist.md` · `README.md` · `AGENTS.md` · `CLAUDE.md` (remover o bloco
"Open — Audio hosting", que o ADR resolve) · `.agents/memory/PROGRESS.md`.

_Acrescentar nota de rodapé, sem editar o corpo:_ `.agents/memory/F2-S02.md` ·
`.agents/memory/F4-S03.md` · `docs/agents-plans/plan-f2-s02-*.md` ·
`docs/agents-plans/plan-f2-s04-*.md` · `docs/agents-plans/plan-f4-s03-*.md`.

_Proibido tocar:_ `src/db/schema/**` · `drizzle/**` · `src/modules/**/*.{routes,service,repository}.ts` ·
`src/app.ts` · `src/config/env.ts` · `.env.example` · qualquer arquivo de F5.

**Casos de teste obrigatórios.**

| Caso       | Arquivo                                    | Afirma                                                                                                          |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **T16′**   | `tests/integration/seed.test.ts`           | as 40 `audioUrl` casam `^https://cdn\.<dominio>/tracks/[a-z0-9-]+\.mp3$`                                        |
| **T16″**   | `tests/integration/seed.test.ts`           | as 40 `audioUrl` são **distintas entre si** — o defeito que motivou a migração                                  |
| **T17**    | `tests/integration/seed.test.ts`           | durações seguem em `120..380` (ou o intervalo novo, se declarado no brief)                                      |
| **E14′**   | `tests/e2e/specs/catalog-flow.e2e.test.ts` | `audioUrl` de todas as faixas começa com `CDN_BASE_URL` — some o `toContain('SoundHelix')`                      |
| **T-novo** | `tests/unit/…` (ou integração)             | o slug derivado de `(artistName, title)` bate com o slug na URL das 40 faixas — pega erro de digitação em massa |

**DoD.** Os cinco portões, mais:

```bash
docker compose up -d && pnpm db:migrate
tsx src/db/seed/seed.ts && tsx src/db/seed/seed.ts   # 2ª execução: 0 inseridos
git grep -ci soundhelix -- src tests docs/specs docs/sprints \
  .agents/rules .agents/skills .agents/agents README.md AGENTS.md CLAUDE.md   # esperado: 0
tsx scripts/verify-media-urls.ts    # HEAD nas 40 URLs → 200 + content-type: audio/mpeg
```

> O `verify-media-urls.ts` **roda à mão, nunca no CI**. O CI é hermético — spec `05` diz que
> os testes não dependem de rede. Um job que faz `HEAD` num CDN externo transforma
> instabilidade de rede em build vermelho e treina o time a ignorar CI vermelho.

**Armadilhas conhecidas.**

1. **T16 e E14 quebram na primeira linha alterada.** Ajustar os dois **antes** de mexer nas 40
   URLs, ou o agente passa a sprint inteira com a suíte vermelha e perde o sinal.
2. **Não regerar `plan-f2-s02-*.md`** (o handoff original mandava). É registro de sprint
   fechada — nota de rodapé, não reescrita.
3. **Idioma (D-25):** `.agents/**` e `CLAUDE.md` em inglês; `docs/**`, `README.md` e
   `AGENTS.md` em PT-BR. A mesma frase muda de idioma conforme o arquivo.
4. **Dívida "30+ faixas / 5–8 artistas"** sobrevive em 5 arquivos do Tier 4 e D-28 já a
   substituiu por 40/8. São exatamente as linhas que a sprint vai editar — corrigir de
   carona (ver Q5).
5. **Durações inventadas.** Substituir pelos valores do `ffprobe`, não manter os antigos.
6. **`process.env` é erro de lint fora de `env.ts`.** `CDN_BASE_URL` é constante, não env.

---

## 10. Perguntas abertas — travam a redação das specs

| #      | Pergunta                                                                                         | Recomendação                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | **Qual domínio?** Entra em 40 URLs, na regex de T16′, em E14′, na spec `03` e na `08`.           | `cdn.<seu-dominio>` com DNS já na Cloudflare. **Sem isso nada começa.**                                                                            |
| **Q2** | **De onde vem o áudio e sob qual licença?** (§4) — é a pergunta que define se a feature é legal. | CC0/domínio público como padrão; CC-BY como exceção com crédito em `docs/creditos-do-catalogo.md`. **Nunca** gravação comercial sob nome fictício. |
| **Q3** | **Capas e avatares migram junto?** São **16 imagens distintas**, não 48.                         | Migrar — mas em **sprint separada** (F2-S06), depois que o áudio estiver estável.                                                                  |
| **Q4** | **Numeração da sprint** (§9.2).                                                                  | `F2-S05` (+`F2-S06`), sem renumerar nada.                                                                                                          |
| **Q5** | **Corrigir a dívida "30+/5–8"** nos 5 arquivos do Tier 4 junto, ou deixar para F5-S03?           | Junto. São as mesmas linhas que serão editadas; separar cria um segundo passe pelo mesmo texto.                                                    |
| **Q6** | **O script `verify-media-urls.ts` existe?**                                                      | Sim, em `scripts/`, executado à mão no DoD. **Fora do CI** — o CI é hermético.                                                                     |
| **Q7** | **As tags ausentes de F1–F4 (V1)** — selar retroativamente ou emendar D-08?                      | Selar `v0.1.0`…`v0.4.0` nos commits de merge correspondentes, antes de F5. É barato agora e caro depois.                                           |
| **Q8** | **Crédito no payload da API?** (Opção 2 do §4.3)                                                 | **Não** antes do `v1.0.0`. Mudança de contrato na véspera do deploy. Se for querido, é fase própria.                                               |

---

## 11. Ordem de execução recomendada até o `v1.0.0`

```
 [dono]  Q1…Q8 respondidas
    │
 [dono]  P0 — Cloudflare: bucket, cdn.<dominio>, 40 objetos, tabela de durações
    │
 [agente] F2-S05 — Migração do áudio (D-49, D-50, spec 08, cascata, seed, T16′/T16″/E14′)
    │
 [agente] F2-S06 — Capas e avatares (condicional à Q3)
    │
 [dono]  Selar v0.1.0…v0.4.0 (Q7)
    │
 [agente] F5-S01 — OpenAPI export + check no CI     ← depois da migração, para gerar
    │                                                  openapi.json já com o CDN nos exemplos
 [agente] F5-S02 — Deploy na Railway
    │
 [agente] F5-S03 — Hardening, auditoria, v1.0.0
```

**Por que a migração vem antes de F5-S01.** Os três `*.schema.ts` de módulo carregam
`.describe('… (SoundHelix)')`, e esse texto entra no `openapi.json`. Gerar o contrato
versionado antes da migração significa commitá-lo errado e regerá-lo na sprint seguinte —
com o `--check` do CI acusando diff no meio do caminho.

**Por que a migração vem antes do deploy.** Colocar em produção um catálogo cujas 40 faixas
tocam 16 áudios repetidos é publicar o defeito que motivou toda esta análise.

---

## 12. O que este guia deliberadamente não faz

- **Não altera nenhum arquivo do projeto.** Nenhum ADR foi escrito, nenhuma spec tocada,
  nenhuma sprint criada. Isso é trabalho autorizado depois das respostas do §10.
- **Não escolhe o domínio, nem o acervo, nem a licença.** São decisões do dono; inventá-las
  aqui seria exatamente o "escrever escolha em spec como se o projeto já tivesse decidido"
  que o `CLAUDE.md` proíbe.
- **Não reabre o Caminho A vs Caminho B.** A escolha do handoff está certa e preserva D-09
  e D-10.
- **Não resolve o hotlink.** Bucket público é hotlinkável; defender violaria D-10. Aceito
  conscientemente, e é isso que o D-49 precisa dizer com todas as letras.
