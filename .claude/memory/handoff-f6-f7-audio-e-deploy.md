# HANDOFF — F6 (áudio próprio na R2) e F7 (deploy e release)

> **Leia este arquivo antes de escrever qualquer brief de F6 ou F7.** Ele é o insumo de
> planejamento: o que já está decidido, o que foi medido nesta árvore, e o que ainda falta
> perguntar. Não é normativo — o que vincula são os ADRs `D-64`…`D-70` e `D-73`.
>
> |                 |                                                                              |
> | --------------- | ---------------------------------------------------------------------------- |
> | **Data**        | 2026-09-11                                                                   |
> | **Base**        | `develop`, working tree com os documentos desta sessão                       |
> | **Autor**       | Claude Code (Opus 5), Staff Engineer (D-42)                                  |
> | **Substitui**   | `.claude/memory/handoff-migracao-audio-r2.md` (2026-09-04) no que diverge    |
> | **Complementa** | `docs/guides/analise-migracao-audio-cloudflare-r2.md` (2026-09-08)           |
> | **Estado**      | **todas as decisões fechadas** · faltam os briefs de F6-S01, F6-S02 e F7-S02 |

---

## 1. O que ficou decidido nesta sessão

Sete ADRs novos, todos já em `.agents/memory/DECISIONS.md`:

| ADR      | Decisão                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| **D-64** | Roadmap vai de 5 para **7 fases**. F5 → `v0.5.0`, F6 (áudio) → `v0.6.0`, F7 (deploy) → `v1.0.0` |
| **D-65** | R2 **Caminho A**: storage estático, API nunca fala com a R2, D-09 e D-10 preservadas            |
| **D-66** | O acervo é **do dono**. Crédito e licença ficam fora do contrato da API — sem coluna nova       |
| **D-67** | **Capas e avatares migram junto** — 16 imagens distintas, catálogo autocontido                  |
| **D-68** | `sound-api.cardosolabs.space` + `cdn.cardosolabs.space/cardoso-sound/…`                         |
| **D-69** | Duração das faixas vem de `music-metadata` (devDependency); `ffprobe` fica fora do projeto      |
| **D-70** | `tsconfig.json` passa a incluir `scripts/**/*.ts`                                               |

O **D-68 recebeu uma emenda** em 2026-09-11 fechando o nome do bucket (`cardosolabs-media`, único
para todos os projetos) e pondo a regra de CORS **fora de escopo** — o cliente Flutter é nativo.

E três da sessão anterior, que continuam valendo para F7: **D-61** (migração no
`preDeployCommand`), **D-62** (domínio próprio desde o dia 1), **D-63** (`v1.0.0-rc.1`, agora
emendada por D-64 para ser o release candidate de F7).

**Contexto do dono, que justifica várias escolhas:** aplicação de **portfólio**, no ar por
**cerca de uma semana**. `cardosolabs.space` é domínio **compartilhado**, destinado a hospedar
várias demonstrações — daí o escopo por projeto do D-68.

---

## 2. Números medidos nesta árvore — use estes, não os dos documentos antigos

O handoff de 2026-09-04 e o guia de 2026-09-08 envelheceram. Estes valores foram medidos hoje:

| Fato                                     | Valor                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Arquivos citando `soundhelix`            | **29** — 10 de código/teste, 19 de documentação e memória                |
| Arquivos citando `unsplash`              | **6**                                                                    |
| Faixas no seed                           | 40, servidas hoje por **16** áudios distintos                            |
| Imagens distintas                        | **8 capas + 8 avatares = 16** (não 48 — são 40 _ocorrências_ de 8 URLs)  |
| Durações atuais                          | **140 s a 345 s**                                                        |
| `T17` exige                              | `120 ≤ durationSeconds ≤ 380` (`tests/integration/seed.test.ts:127-128`) |
| Volume estimado no bucket                | ~250 MB de 10 GB gratuitos · egress zero · **custo US$ 0**               |
| `audio_url` / `cover_url` / `avatar_url` | `varchar(500)` — a URL do CDN dá ~70–90 chars. **Schema não muda**       |

### A convenção de nomes do D-68 foi verificada contra os 40 títulos reais (2026-09-11)

Não é presunção: os slugs foram computados a partir de `src/db/seed/data/tracks.data.ts`.

| Verificação                            | Resultado                                               |
| -------------------------------------- | ------------------------------------------------------- |
| Colisão de slug entre as 40 faixas     | **nenhuma**                                             |
| Título ou nome de artista não-ASCII    | **nenhum** — a regra de transliteração não é exercitada |
| Nome de objeto mais longo              | `echoes-of-orion--boom-bap-renaissance.mp3` — 41 chars  |
| URL completa mais longa                | **92 chars** — folgado no `varchar(500)`                |
| Durações atuais dentro da janela `T17` | as 40 — margem para o áudio real divergir               |

**Consequência para o P0:** os 40 nomes de arquivo são **determinísticos e já conhecidos**. O P0.6
manda "reunir os 40 MP3" mas não diz como nomeá-los — a tabela `título → nome de objeto` é o
primeiro artefato da próxima sessão (§11), e sem ela o dono não consegue executar P0.6 e P0.9.

### Os 10 arquivos de código e teste

| Arquivo                                                     | Ocorr. | O que acontece quando a URL mudar          |
| ----------------------------------------------------------- | ------ | ------------------------------------------ |
| `src/db/seed/data/tracks.data.ts`                           | 40     | o alvo — 40 `audioUrl` + 40 `coverUrl`     |
| `src/db/seed/data/artists.data.ts`                          | 8      | 8 `avatarUrl` (D-67)                       |
| `src/modules/tracks/tracks.schema.ts:62`                    | 1      | `.describe('… (SoundHelix)')`              |
| `src/modules/playlists/playlists.schema.ts:85`              | 1      | idem                                       |
| `src/modules/favorites/favorites.schema.ts:39`              | 1      | idem                                       |
| `tests/integration/seed.test.ts:104-114`                    | 5      | **T16 quebra** — regex do SoundHelix       |
| `tests/e2e/specs/catalog-flow.e2e.test.ts:148`              | 1      | **E14 quebra** — `toContain('SoundHelix')` |
| `tests/unit/modules/artists/artists.service.test.ts`        | 4+5    | fixtures (não quebram, mas mentem)         |
| `tests/unit/modules/{tracks,playlists,favorites}/*.test.ts` | 4      | fixtures                                   |

---

## 3. Três achados que nenhum documento anterior registra

### 3.1 `docs/openapi.json` tem 6 ocorrências de SoundHelix — e o CI barra

As três `*.schema.ts` carregam `.describe('URL pública direta de reprodução da faixa (SoundHelix)')`,
e isso **é serializado para `docs/openapi.json`**, que é artefato versionado com verificação no CI
(`pnpm openapi:export -- --check`, D-21/D-59). Consequência para o brief de F6:

- o blast radius **precisa** incluir os três `*.schema.ts` **e** `docs/openapi.json`;
- o passo de regerar o contrato (`pnpm openapi:export`) é **obrigatório no DoD**, senão o CI fica
  vermelho por diff de artefato, não por bug.

O guia de 2026-09-08 mencionou os `.describe()`, mas não fechou o laço com o portão de CI.

### 3.2 Um script novo em `scripts/` **escapa do `pnpm typecheck`**

`tsconfig.json` tem `include: ["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.mts"]` —
**`scripts/` não está lá**. O `scripts/export-openapi.ts` só é typechecked porque
`tests/integration/openapi.test.ts:6` o importa. Um `scripts/ingest-media.ts` novo, sem teste que
o importe, passa batido pelo portão.

**Decidido em 2026-09-11 — `D-70`: opção (a).** `include` passa a
`["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "*.config.ts", "*.config.mts"]`.
`tsconfig.json` entra no blast radius de F6-S02. A opção (b) — exigir um teste que importe o módulo
de ingestão — foi recusada por resolver só o script da vez.

> ESLint **cobre** `scripts/` (regra `files: ['**/*.ts']`), mas o bloco com `no-console` e a
> proibição de `process.env` é escopado em `files: ['src/**/*.ts']`. Ou seja: o script de ingestão
> **pode** ler as credenciais da R2 de `process.env` legitimamente. Isso não é exceção nem gambiarra.

### 3.3 `ffprobe` não existe nesta máquina

`command -v ffprobe` → ausente; `command -v ffmpeg` → ausente. E D-65 exige derivar as 40 durações
dos arquivos reais.

**Decidido em 2026-09-11 — `D-69`: `music-metadata` como `devDependency`.** JS puro, sem binário
externo; o script de ingestão fica autocontido, testável e executável em qualquer clone. `ffmpeg`
do sistema foi recusado: exige `apt install` que o próximo clone não herda. Consequência para o
brief de F6-S02: `package.json` e `pnpm-lock.yaml` entram no blast radius, a duração é arredondada
para segundos inteiros, e nenhum valor antigo é copiado.

---

## 4. Pré-requisitos do dono para F6 (P0) — trabalho manual, não é sprint

| #         | Passo                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1      | Comprar `cardosolabs.space` e **mover a zona DNS para a Cloudflare**. Sem zona na Cloudflare não há custom domain para o bucket                                                  |
| P0.2      | R2 → Create bucket **`cardosolabs-media`** — um só bucket, compartilhado entre os projetos do domínio (emenda do D-68)                                                           |
| P0.3      | Anotar o Account ID (endpoint S3: `https://<account_id>.r2.cloudflarestorage.com`)                                                                                               |
| P0.4      | Bucket → Settings → Public access → **Connect Custom Domain** → `cdn.cardosolabs.space`. **Nunca `*.r2.dev`**                                                                    |
| P0.5      | R2 → Manage API Tokens → token **Object Read & Write**, escopo só neste bucket. O secret aparece uma vez                                                                         |
| P0.6      | Reunir os **40 MP3** próprios. Normalizar: CBR 128–192 kbps, 44,1 kHz, ID3 limpo                                                                                                 |
| P0.7      | **Cada faixa entre 2min00 e 6min20** — fora disso `T17` muda, e a mudança tem que estar no brief, não descoberta na execução                                                     |
| P0.8      | Reunir as **16 imagens** (8 capas de artista + 8 avatares), D-67                                                                                                                 |
| P0.9      | Upload com os dois headers obrigatórios (§5)                                                                                                                                     |
| P0.10     | Verificar: `curl -I` em 3 URLs → `200`, `content-type: audio/mpeg`, `accept-ranges: bytes`                                                                                       |
| ~~P0.11~~ | ~~CORS no bucket~~ — **removido em 2026-09-11**: o cliente Flutter é **nativo**, e app nativo não faz requisição sujeita a CORS. Reabre só se existir build Web (emenda do D-68) |

### Headers do upload — não são detalhe

```bash
rclone copy ./audio r2:cardosolabs-media/cardoso-sound/tracks \
  --header-upload "Content-Type: audio/mpeg" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
```

- Sem `Content-Type: audio/mpeg` a R2 entrega `application/octet-stream` e parte dos players
  (incluindo `just_audio` em alguns cenários) engasga.
- `max-age` de um ano só é seguro porque **o nome do objeto é imutável** (D-68): áudio novo é slug
  novo. Essa regra precisa estar na spec, não só aqui.
- **Range requests** a R2 atende nativamente — é o que faz o _seek_ funcionar. Nada a configurar,
  mas vale como verificação manual (`curl -r 0-1023 -I`).

---

## 5. Convenção de nomes (D-68), para não reabrir

```
https://cdn.cardosolabs.space/cardoso-sound/tracks/<artist-slug>--<title-slug>.mp3
https://cdn.cardosolabs.space/cardoso-sound/covers/<artist-slug>.jpg
https://cdn.cardosolabs.space/cardoso-sound/artists/<artist-slug>.jpg
```

Exemplo: `…/tracks/aurora-avenue--midnight-overdrive.mp3`

Slug: minúsculas, ASCII, não-alfanumérico vira `-`, hifens colapsados, sem hífen nas pontas.
O prefixo do artista existe porque a unicidade no banco é `UNIQUE (artist_id, title)`, **não**
`UNIQUE (title)` — hoje os 40 títulos são globalmente únicos por acidente, e um slug flat
colidiria silenciosamente no dia em que dois artistas compartilhassem título.

`CDN_BASE_URL` mora em `src/config/constants.ts` (D-65), com o valor
`https://cdn.cardosolabs.space/cardoso-sound`. **`env.ts` e `.env.example` não mudam** — é valor
público, determinístico e igual em todo ambiente, logo constante, não variável de ambiente.

---

## 6. Estrutura proposta para os sprints — a escrever

### F6 — Áudio e imagem próprios (tag `v0.6.0`)

| Unidade    | Executa | Entrega                                                                                                                                    |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**     | o dono  | Runbook da §4. Bucket no ar, CDN servindo, 56 objetos, tabela `slug → duração`                                                             |
| **F6-S01** | agente  | Spec `09-midia-e-cdn.md` + cascata de decisões e specs (Tier 1 e 2)                                                                        |
| **F6-S02** | agente  | `CDN_BASE_URL`, script de ingestão, `tracks.data.ts`, `artists.data.ts`, durações reais, T16, E14, fixtures, `*.schema.ts`, `openapi.json` |

Separar em dois sprints é recomendação, não decisão: F6-S02 sozinho toca ~15 arquivos, e juntar a
cascata documental ao código faz um PR que ninguém revisa de verdade.

**A spec nova é `docs/specs/09-midia-e-cdn.md`** — o número `08` já é
`08-blindagem-de-seguranca.md`. (O guia de 2026-09-08 propunha `08`; o número foi tomado depois.)
Índice sugerido: escopo · topologia do bucket · convenção de nome · imutabilidade · headers de
upload · range requests · CORS **fora de escopo, com a condição única que o reabre** (build Flutter
Web — emenda do D-68) · licenciamento (D-66) · domínio e DNS · verificação
manual fora do CI · segredos (e a afirmação de que nenhum entra em produção) · fora de escopo
(upload pela API, presigned, transcodificação, HLS, contador — D-09 e D-10).

### F7 — Deploy, auditoria e release (tag `v1.0.0`) — **última fase** (D-73)

| Sprint     | Arquivo                                               | Estado                                           |
| ---------- | ----------------------------------------------------- | ------------------------------------------------ |
| **F7-S01** | `docs/sprints/fase-7-deploy/F7-S01-deploy-railway.md` | **escrito, auditado e renumerado** em 2026-09-11 |
| **F7-S02** | —                                                     | **a escrever** — absorve o antigo `F5-S09`       |

**Movimentação já executada em 2026-09-11 (D-73).** O brief de deploy saiu de
`fase-5-producao/F5-S08-deploy-railway.md` para `fase-7-deploy/F7-S01-deploy-railway.md`, e o plano
do agente de `plan-f5-s08-deploy-railway.md` para `plan-f7-s01-deploy-railway.md`. Corpo, branch
(`feature/f7s01-deploy-railway`), prompt de abertura, blast radius e memória alvo (`F7-S01.md`) já
apontam para F7. **Não há mais nada a mover.**

**`F5-S09` foi removido.** A F5 encerrou-se como fase de autenticação e blindagem e fecha em
`v0.5.0` sem sprint adicional — os 27 GAPs já estavam fechados em F5-S02…F5-S07 e F5-S10. Todo o
escopo do brief apagado é agora o de **F7-S02**, ainda por escrever:

- checklist da spec `08` §9 (que absorve o da spec `04` §7), **com evidência colhida contra a API
  no ar** — é o ganho real de a auditoria vir depois do deploy, e não antes;
- `docs/AUDITORIA.md` com o resultado;
- `README.md` reconciliado com o que foi de fato construído;
- `docs/FLUTTER.md`, guia de integração para o cliente;
- os dois itens que F7-S01 declara como não-objetivo e adia: `servers` de produção no
  `docs/openapi.json` (consequência de D-62) e gatear o `deploy.yml` no CI verde;
- tag `v1.0.0` e GitHub Release, fechando o projeto (D-08, D-63).

Os ADRs que o agente de F7-S01 registra são **D-71** (seed manual) e **D-72** (sem rollback
automático). **Renumerados em 2026-09-11**: a F6 roda antes da F7 e tomou D-69 (duração) e D-70
(`tsconfig`). O brief e o plano de F7-S01 já estão corrigidos.

---

## 7. Regra para as memórias de sprint fechada

`F2-S02.md`, `F4-S03.md`, `plan-f2-s02-*.md`, `plan-f2-s04-*.md`, `plan-f4-s03-*.md` **registram o
passado**. Reescrevê-las apaga história.

**Não editar o corpo. Acrescentar uma nota de rodapé** apontando para o ADR novo: "`audioUrl`
migrado para a R2 em D-65, fase F6". Vale inclusive para o `plan-f2-s02-*.md`, que o handoff antigo
mandava **regerar** — regerar plano de execução de sprint fechada é falsificar registro, não
corrigir.

---

## 8. Emendas de ADR que F6 precisa fazer

| ADR      | O que muda                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| **D-10** | Só o host citado: "toca direto do SoundHelix" → "toca direto do CDN próprio (D-65)". A decisão não muda         |
| **D-28** | Só a _Consequência_: "~16 URLs distintas / o áudio repete" deixa de ser verdade. A _Decisão_ (8/40/6) permanece |

E o `CLAUDE.md` perde o bloco **"Open — needs the owner's decision · Audio hosting"**, que existia
exatamente porque o handoff não era ADR. Agora é: D-65.

---

## 9. Armadilhas

1. **Esquecer `pnpm openapi:export`** deixa o CI vermelho por diff de artefato. §3.1.
2. **Script novo em `scripts/` sem cobertura de typecheck.** §3.2.
3. **Faixa fora de 2min00–6min20 quebra T17** e ninguém percebe até o sprint estar em execução. P0.7.
4. **`durationSeconds` copiado do valor antigo** em vez de derivado do arquivo — mata a única razão
   pela qual T17 passa a valer alguma coisa (D-65).
5. **E14 quebra junto com T16.** O handoff de 2026-09-04 dizia que E14 era "opcional"; é falso desde
   F4-S03: `catalog-flow.e2e.test.ts:148` faz `toContain('SoundHelix')`.
6. **`*.r2.dev` em produção** — rate-limited, desaconselhado pela própria Cloudflare. D-68.
7. **Sem `Content-Type: audio/mpeg` no upload**, players engasgam. §4.
8. **Zona DNS fora da Cloudflare** impede o custom domain do bucket. P0.1 é o primeiro passo por isso.
9. **Os 40 MP3 no repositório.** `.gitignore` **não tem** entrada para áudio hoje — acrescentar
   `audio/` antes de qualquer `git add`, ou 200 MB entram no histórico e não saem.
10. **Bucket público = hotlink livre**, aceito conscientemente em D-65. Como a demo fica no ar ~1
    semana, o bucket deve sumir junto com ela.

---

## 10. Perguntas ao dono — todas as cinco fechadas em 2026-09-11

| #     | Pergunta                                  | Resposta                                                      | Onde ficou registrada     |
| ----- | ----------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| ~~1~~ | `ffmpeg` do sistema ou `music-metadata`?  | **`music-metadata` como `devDependency`**                     | **D-69** · §3.3           |
| ~~2~~ | `tsconfig.json` inclui `scripts/**/*.ts`? | **Sim**                                                       | **D-70** · §3.2           |
| ~~3~~ | Nome do bucket                            | **`cardosolabs-media`, um só para todos os projetos**         | emenda do **D-68** · P0.2 |
| ~~4~~ | O Flutter vai rodar em Web?               | **Não — nativo (Android/iOS)**. P0.11 (CORS) deixa de existir | emenda do **D-68** · §4   |
| ~~5~~ | F5-S09 ainda é necessário?                | **Não — brief removido**; escopo virou `F7-S02`               | **D-73** · §6             |

**Nenhum dos dois bloqueios de F6-S02 existe mais.** O blast radius do brief ganha `tsconfig.json`,
`package.json` e `pnpm-lock.yaml`; a numeração de ADR de F7-S01 foi corrigida para D-71/D-72.

### 10.5 — F5-S09: decidido, apagado

**Decisão do dono em 2026-09-11, registrada em `D-73`:** a F5 foi apenas a fase de correções de
autenticação e blindagem, e encerra-se nos oito sprints mergeados. O brief
`F5-S09-hardening-e-release.md` foi **removido do repositório** — ele ainda se intitulava "Release
`v1.0.0`", se declarava "último sprint do projeto" e "depende de F5-S08", três afirmações que o
D-64 já tinha tornado falsas.

Seu escopo real não se perdeu: está listado na §6 acima como o conteúdo de **F7-S02**. Quem for
escrever esse brief acha a lista lá, e o texto original no histórico do git
(`git show HEAD:docs/sprints/fase-5-producao/F5-S09-hardening-e-release.md`).

**Nada mais está em aberto neste handoff.** Os dois bloqueios de F6-S02 caíram (D-69, D-70), a
topologia da R2 está fechada (D-65…D-68) e a F7 tem o brief de S01 pronto. O que falta é trabalho,
não decisão: o **P0 manual do dono** (§4) e os briefs de F6-S01, F6-S02 e F7-S02.

---

## 11. Ponto de partida da próxima sessão (2026-09-11, fim do dia)

**O dono foi comprar `cardosolabs.space`.** A sessão seguinte roda de outra máquina — por isso este
arquivo está **versionado no repositório**: a memória local do Claude Code não viaja entre máquinas,
este handoff viaja.

### Estado ao fechar esta sessão

| Item                                | Estado                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| Decisões de F6 e F7                 | **todas fechadas** — D-64…D-70, D-73, emenda ao D-68                |
| F5                                  | **encerrada** (D-73), fecha em `v0.5.0`, sem sprint de fechamento   |
| `F7-S01`                            | brief e plano escritos, auditados, em `docs/sprints/fase-7-deploy/` |
| `F6-S01`, `F6-S02`, `F7-S02`        | **a escrever**                                                      |
| P0 manual do dono                   | **em andamento** — compra do domínio                                |
| `audio/` e `media/` no `.gitignore` | ✅ acrescentados nesta sessão, antes de qualquer `git add`          |

### A ordem acordada para retomar

1. **Runbook de P0 com a tabela de nomes** — os 40 `.mp3` e as 16 imagens, nome exato, derivados da
   convenção do D-68 e já verificados contra o seed (§2). É o que destrava o trabalho manual do
   dono, e é curto. **Começar por aqui.**
2. **Brief de `F6-S01`** — spec `docs/specs/09-midia-e-cdn.md` mais a cascata documental. Não
   depende do P0: o agente pode executá-lo enquanto o dono junta o áudio.
3. **Brief de `F6-S02`** — o código. Pode ser escrito a qualquer momento, mas **só executa depois
   do P0**: o DoD exige `curl -I` devolvendo 200 no CDN, e sem bucket o sprint morre no passo 1.
4. **Brief de `F7-S02`** — escopo já listado na §6.

### O que não pode ser esquecido ao retomar

- O caminho crítico da F6 **não é brief nenhum — é o P0, e é do dono.**
- O blast radius de `F6-S02` cresceu com as decisões desta sessão: além do que a §2 lista, entram
  `tsconfig.json` (D-70), `package.json` e `pnpm-lock.yaml` (D-69).
- `pnpm openapi:export` é **obrigatório no DoD** de F6-S02, senão o CI fica vermelho por diff de
  artefato (§3.1).
- Os números de ADR livres são **D-74** em diante. **D-71 e D-72 estão reservados** para `F7-S01`
  registrar na execução (seed manual, sem rollback automático).
