# HANDOFF — Migração do áudio do seed para Cloudflare R2

> **Status:** decidido, **não implementado**. Nada foi alterado ainda — este documento é o
> mapa completo do que mudar, levantado por varredura em `docs/`, `.agents/`, `README.md`
> e `AGENTS.md`.
>
> |                 |                                           |
> | --------------- | ----------------------------------------- |
> | **Data**        | 2026-09-04                                |
> | **Branch base** | `develop` @ `913ed1d`                     |
> | **Sprint**      | F2-S02 **concluída e mergeada** no PR #17 |
> | **Decisão**     | Caminho A — R2 como storage estático      |

---

## 1. A decisão

O `audioUrl` do seed sai do **SoundHelix** e passa a apontar para um **bucket Cloudflare R2
público, sob domínio próprio** (`cdn.<dominio>/tracks/<slug>.mp3`).

### Por que R2, e não as alternativas

O caminho percorrido até aqui, para não reabrir a discussão:

| Alternativa            | Por que caiu                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| Manter SoundHelix      | Só ~16 áudios; repetem em 40 faixas; "sons horríveis"             |
| Spotify Web API        | Quota do Developer Mode — já rejeitado na spec `00` §1            |
| Previews iTunes/Deezer | Nomes famosos, mas só 30 s, e a duração real não bate com o áudio |
| YouTube embed          | Quebra background playback, exige WebView, ToS veda extrair áudio |
| Jamendo / CC           | Faixa completa e legal, mas artistas não famosos                  |
| **R2 (escolhido)**     | Faixa completa, egress zero, catálogo autocontido, URL estática   |

### Caminho A vs Caminho B (o que NÃO estamos fazendo)

- **A (escolhido)** — R2 é só storage. Upload por script/`rclone`, seed grava as URLs,
  API continua read-only. Preserva D-09 e D-10.
- **B (descartado)** — API gerencia upload (presigned PUT, CRUD de catálogo, admin).
  Colide com três decisões vigentes: D-09 (catálogo read-only), RBAC e upload de arquivos,
  ambos fora de escopo na spec `00` §3. Seria fase nova, não sprint.

### O que a decisão preserva

- **D-10 intacta** — bucket público entrega URL estática: sem proxy, sem endpoint de
  streaming, sem URL assinada. É o ponto que um revisor questiona primeiro; responder já.
- **D-09 intacta** — catálogo segue mutável só por seed.
- **Schema intacto** — `audio_url varchar(500)` cabe folgado (URL do CDN ≈ 70 chars).
- **Contrato de API intacto** — só muda o host no exemplo.
- **Seed segue offline e determinístico** — sem dependência de rede nos testes.
- **`durationSeconds` volta a ser honesto** — faixa completa, então T17 fica válido de
  verdade (era o furo dos previews de 30 s).

### Consequência aceita

Bucket público = **hotlink livre**. A defesa (Token Auth / signed URL) violaria D-10.
Para MVP de portfólio, aceitar é o certo — mas é escolha consciente, não esquecimento.

---

## 2. Estado do repositório na pausa

`develop` limpo e sincronizado com `origin/develop` em `913ed1d`.

**F2-S02 foi concluída e mergeada** (`913ed1d feat(db): adiciona seed do catalogo e harness
de integracao testcontainers (#17)`). Ou seja: o seed com SoundHelix, o harness
Testcontainers, `schema.test.ts` e `seed.test.ts` **já estão em `develop`**.

Consequência para esta migração — a janela barata passou. A troca deixou de caber _dentro_
da sprint aberta e vira **sprint de follow-up com PR próprio**. Na prática isso muda dois
pontos do mapa abaixo:

- **T16 já existe no código mergeado** (`tests/integration/seed.test.ts`) e afirma a regex
  do SoundHelix. Ele vai **falhar** no instante em que as URLs mudarem — é o primeiro
  teste a ajustar, não uma preocupação futura.
- **Corrigir o arquivo `F2-S02-*.md`** passa a ser correção retroativa de documentação de
  sprint fechada, não edição de sprint em curso. O conteúdo a corrigir é o mesmo.

Estado do catálogo hoje em `develop`: 40 faixas, distribuição de gênero 8/7/7/6/6/6
conforme D-28, 16 URLs distintas do SoundHelix, 40 `coverUrl` + 8 `avatarUrl` no Unsplash.

---

## 3. Mapa completo de alterações

**14 arquivos de documentação + 2 de código.** Nenhuma mudança de schema ou de contrato.

### Tier 1 — Decisões (raiz da cascata, fazer primeiro)

As specs referenciam decisões, então `DECISIONS.md` vem antes de tudo.

| Local                                         | Ação                                                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/memory/DECISIONS.md` — **nova D-41** | Última decisão hoje é **D-40**. Registrar "Áudio próprio em Cloudflare R2 sob domínio dedicado", declarando explicitamente que preserva D-10 e assumindo o hotlink livre                     |
| `DECISIONS.md:265–272` — **D-28**             | A _Decisão_ (8 artistas / 40 faixas / ≥5 por gênero / idempotência) **permanece**. A _Consequência_ inteira — "~16 URLs distintas", "o áudio repete" — morre. Reescrever apontando para D-41 |
| `DECISIONS.md:103–109` — **D-10**             | Só troca o host: "toca direto do SoundHelix" → R2. A decisão em si não muda                                                                                                                  |

### Tier 2 — Specs

| Arquivo                               | Linha | Ação                                                                                                                   |
| ------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/00-visao-geral.md`        | 15    | §1: "seed local com áudios públicos do SoundHelix" → R2. O motivo da frase (fugir da quota do Spotify) continua válido |
| `docs/specs/00-visao-geral.md`        | 96–99 | §6: bullet das ~16 URLs e da repetição **sai inteiro** → entra a convenção de slug do CDN                              |
| `docs/specs/03-contrato-da-api.md`    | 141   | Exemplo do payload `Track` com URL SoundHelix literal → URL do CDN                                                     |
| `docs/specs/00-visao-geral.md`        | 47    | **Não muda** — verificado: R2 público não viola "sem URL assinada"                                                     |
| `docs/specs/02-modelo-de-dados.md`    | 142   | **Não muda** — verificado: `varchar(500)` comporta                                                                     |
| `docs/specs/05-testes-e-qualidade.md` | 101   | **Não muda** — só trata de UNIQUE/idempotência                                                                         |

### Tier 3 — Sprints

**`docs/sprints/fase-2-catalogo/F2-S02-seed-e-harness-de-integracao.md` — 6 pontos:**

| Linha   | Ação                                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 170     | Regra do `audioUrl` na tabela §5.2 → padrão de slug no CDN                                                                                                                                                                                                                                                           |
| 172–173 | Blockquote sobre a repetição do SoundHelix **sai inteiro** → nota de 40 arquivos únicos                                                                                                                                                                                                                              |
| 249     | **T16** — regex `soundhelix.com/.../SoundHelix-Song-\d+\.mp3` → regex do domínio novo                                                                                                                                                                                                                                |
| 169     | `coverUrl` "URL estável de placeholder" → depende da questão em aberto #2                                                                                                                                                                                                                                            |
| 105–134 | **§4 Blast radius** — autoriza só `src/db/seed/**` e `tests/**`. Como F2-S02 está fechada, o blast radius relevante é o da **nova** sprint de follow-up, que precisa declarar `docs/specs/**`, `docs/sprints/**` e `DECISIONS.md`. Por D-30 ("sprint sem blast radius não é executável"), declarar ANTES de executar |
| 255–273 | **§7 DoD** — item novo: `HEAD` nas 40 URLs retornando 200. Hoje não há como provar que o áudio existe                                                                                                                                                                                                                |

**Downstream:**

| Arquivo                                         | Linha    | Ação                                                                                                                                                               |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fase-5-producao/F5-S03-hardening-e-release.md` | 133      | Acrescentar **SoundHelix** à lista de "suspeitos" da reconciliação final (hoje: Playwright, Neon, Zod 3, RBAC…). Sem isso a varredura final não caça menções órfãs |
| `fase-4-biblioteca/F4-S03-suite-e2e.md`         | 196      | **E14** usa `regex de https://`, genérico demais para quebrar. _Opcional_: apertar para o domínio do CDN                                                           |
| `fase-2-catalogo/F2-S04-modulo-tracks.md`       | 243, 269 | **Não mudam.** O checklist "`audioUrl` tocável" passa a ser verificável de verdade; "não implemente `/stream`" segue valendo                                       |
| `fase-5-producao/F5-S02-deploy-railway.md`      | 179      | **Não muda** — cita D-28 só pela idempotência                                                                                                                      |

### Tier 4 — Docs de agente e raiz

`CLAUDE.md` manda manter `.agents/` em sincronia. **Atenção ao idioma:** `.agents/**` é
inglês, `README.md` e `AGENTS.md` são português.

Há **dívida pré-existente** junto: vários ainda dizem "30+ faixas / 5–8 artistas",
número que D-28 já substituiu por **40/8**.

| Arquivo                           | Linha    | Idioma    | Observação                                   |
| --------------------------------- | -------- | --------- | -------------------------------------------- |
| `.agents/agents/db-specialist.md` | 35       | inglês    |                                              |
| `.agents/skills/db-seed/SKILL.md` | 33       | inglês    |                                              |
| `.agents/rules/database.md`       | 23       | inglês    | SoundHelix **+** "30+" defasado              |
| `README.md`                       | 122, 268 | português | SoundHelix **+** "30+ faixas / 5–8 artistas" |
| `AGENTS.md`                       | 136      | português | idem                                         |

### Tier 5 — Plano e código

| Arquivo                              | Ação                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/agents-plans/plan-f2-s02-*.md` | ~45 linhas com `SoundHelix-Song-N` faixa a faixa (179, 186–254) + T16 na 355. **Regenerar**, não emendar linha a linha |
| `src/db/seed/data/tracks.data.ts`    | 40 `audioUrl`                                                                                                          |
| `tests/integration/seed.test.ts`     | T16                                                                                                                    |

---

## 4. Notas de implementação

**Onde mora o domínio.** `src/config/constants.ts` está **fora do blast radius** de F2-S02.
Não promover o domínio a constante global agora. O certo é um `const CDN_BASE` local no
topo de `tracks.data.ts`, com as URLs montadas por template literal: ponto único de troca,
contrato `SeedTrack.audioUrl: string` intacto, blast radius respeitado.

**Upload para o R2** (`rclone`, R2 é S3-compatible):

```bash
rclone copy ./audio r2:<bucket>/tracks \
  --header-upload "Content-Type: audio/mpeg" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
```

Os dois headers importam:

- sem `Content-Type: audio/mpeg` o R2 infere `application/octet-stream` e alguns players engasgam;
- `Cache-Control` longo é seguro porque o nome do arquivo é imutável (áudio novo = slug novo).

**Domínio customizado, não `*.r2.dev`** — a URL `r2.dev` é rate-limited e a própria
Cloudflare desaconselha em produção. Domínio próprio também dá cache na edge de graça.

**Range requests** — R2 suporta nativamente; é o que faz o seek do `just_audio` funcionar.

**CORS** — só configurar se rodar Flutter Web; nativo ignora.

**Custo** — 40 faixas × ~5 MB ≈ 200 MB, dentro dos 10 GB grátis. Egress zero. **$0**.

---

## 5. Questões em aberto — responder antes de executar

1. **Qual domínio do CDN?** (`cdn.<dominio>.com`) — entra em ~40 URLs, na regex do T16 e
   no exemplo da spec `03`.
2. **As capas migram junto?** Hoje 40 `coverUrl` + 8 `avatarUrl` no Unsplash. Migrar deixa
   o catálogo autocontido, mas exige 48 imagens e aumenta o escopo.
3. **D-41 nova ou emenda em D-28?** _Recomendado:_ D-41 nova + reescrita só da
   _Consequência_ de D-28 — preserva o histórico, que é o propósito do arquivo.
4. **Corrigir o "30+/5–8" defasado** nos 5 arquivos do Tier 4 de brinde, ou deixar para a
   reconciliação de F5-S03? Fora do escopo estrito, mas são exatamente as linhas que serão
   editadas de qualquer forma.

---

## 6. Como retomar

Pré-requisito: ter os 40 arquivos de áudio e o bucket R2 no ar, ou pelo menos o domínio
definido (questão #1).

```
Leia .claude/memory/handoff-migracao-audio-r2.md.
Retome a migração do áudio do seed para Cloudflare R2 (Caminho A).
Domínio do CDN: <preencher>
Capas: <migram junto | ficam no Unsplash>
Comece ampliando o blast radius de F2-S02 §4, depois Tier 1 → Tier 5.
```

Ordem obrigatória: **Tier 1 (decisões) → Tier 2 (specs) → Tier 3 (sprints) → Tier 4 (agente/raiz) → Tier 5 (plano/código)**,
porque specs referenciam decisões e os sprints referenciam specs.

DoD da sprint (`F2-S02` §7) continua valendo, mais o item novo do `HEAD` 200 nas 40 URLs:

```bash
pnpm typecheck && pnpm lint && pnpm format
pnpm test
pnpm build
docker compose up -d && pnpm db:migrate
tsx src/db/seed/seed.ts && tsx src/db/seed/seed.ts   # 2ª vez: 0 inseridos
```
