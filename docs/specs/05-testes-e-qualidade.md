# 05 — Testes e Qualidade

> **D-27: não existe meta percentual de cobertura.** O que trava o merge é a lista
> nominal de casos obrigatórios de cada sprint. Um sprint sem os casos da sua tabela
> não está pronto, mesmo com 100% de cobertura.

---

## 1. Pirâmide

| Nível           | Onde                   | Ferramenta              | Banco            | Custo alvo |
| --------------- | ---------------------- | ----------------------- | ---------------- | ---------- |
| **Unit**        | `tests/unit/**`        | Vitest                  | ❌ nenhum        | < 2 s      |
| **Integration** | `tests/integration/**` | Vitest + Testcontainers | Postgres efêmero | < 60 s     |
| **E2E**         | `tests/e2e/specs/**`   | Vitest + `app.inject()` | Testcontainers   | < 45 s     |

**Playwright não é usado** (D-03). Onde README, `AGENTS.md` ou `.agents/rules/testing.md`
mencionarem Playwright, o texto está desatualizado e é corrigido em F1-S01.

### `vitest.workspace.ts`

Três projects nomeados, para rodar isolados:

```ts
export default ['./vitest.config.ts'];
// projects: 'unit' (tests/unit), 'integration' (tests/integration), 'e2e' (tests/e2e)
```

| Comando                                 | Roda          |
| --------------------------------------- | ------------- |
| `pnpm test`                             | tudo          |
| `pnpm vitest run --project unit`        | só unit       |
| `pnpm vitest run --project integration` | só integração |
| `pnpm vitest run <caminho>`             | um arquivo    |

---

## 2. Testes unitários

Alvo: **services** e **utils**. Nada mais.

- Repository é substituído por um **dublê tipado**, não por `vi.mock` de módulo:
  ```ts
  const repo = { findById: vi.fn(), list: vi.fn() } satisfies Partial<TracksRepository>;
  const service = new TracksService(repo as unknown as TracksRepository);
  ```
  Isso funciona porque a injeção é por construtor (spec `01`, seção 7).
- `beforeEach(() => vi.clearAllMocks())` em **todo** arquivo.
- Zero rede, zero banco, zero `Date.now()` sem controle (`vi.useFakeTimers()` quando
  a asserção depender de tempo).
- Nome do arquivo espelha o alvo: `tests/unit/modules/tracks/tracks.service.test.ts`.

---

## 3. Testes de integração

Alvo: **repositories** e as constraints reais do Postgres.

`tests/setup/testcontainers.ts` expõe:

```ts
export async function startTestDatabase(): Promise<{
  db: Database;
  pool: pg.Pool;
  stop: () => Promise<void>;
}>;
```

Comportamento obrigatório:

1. Sobe `postgres:17-alpine` via `PostgreSqlContainer` — **mesma major da produção**.
2. Aplica as migrações de `drizzle/` com `migrate()` (não `db:push`).
3. Devolve o `db` Drizzle já tipado com o schema.
4. `stop()` fecha o pool e derruba o container.

Uso:

```ts
let ctx: Awaited<ReturnType<typeof startTestDatabase>>;
beforeAll(async () => {
  ctx = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await ctx.stop();
});
beforeEach(async () => {
  await truncateAll(ctx.db);
});
```

- **Um container por arquivo de teste**, criado em `beforeAll` com timeout de 120 s
  (o primeiro pull da imagem é lento).
- Isolamento entre casos por `TRUNCATE ... RESTART IDENTITY CASCADE` no `beforeEach` —
  não por transação com rollback, que esconde bug de constraint deferida.
- Exige daemon Docker ativo. Os runners do GitHub Actions têm.

O que **precisa** de teste de integração (não dá para provar com mock):

- FK com `ON DELETE CASCADE` realmente apagando em cadeia
- PK composta rejeitando duplicata em `playlist_tracks` e `favorites`
- `UNIQUE` de `artists.name` e `(artist_id, title)` fazendo o seed ser idempotente
- Busca `ILIKE` com acento, maiúscula e substring no meio da palavra
- Paginação: `total` correto e `hasNext` virando `false` na última página

---

## 4. Testes E2E

Alvo: **fluxos HTTP completos**, via `app.inject()` — sem servidor, sem porta, sem browser.

```ts
const app = await buildApp();
const res = await app.inject({
  method: 'POST',
  url: '/api/v1/playlists',
  headers: { authorization: `Bearer ${token}` },
  payload: { name: 'Treino' },
});
expect(res.statusCode).toBe(201);
```

Helper obrigatório em `tests/e2e/helpers/auth.ts`:

```ts
export async function signUpAndGetToken(
  app: FastifyInstance,
  email?: string,
): Promise<{
  token: string;
  userId: string;
}>;
```

Faz `POST /api/auth/sign-up/email` e extrai o token do header `set-auth-token`.
E-mail único por chamada (sufixo aleatório) para os casos não colidirem.

### Fluxos E2E obrigatórios (F4-S03)

| #   | Fluxo                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- |
| E1  | sign-up → `GET /me` com Bearer → 200 com o e-mail correto                                      |
| E2  | sign-in com senha errada → 401                                                                 |
| E3  | `GET /api/v1/tracks` sem token → 200 e catálogo populado                                       |
| E4  | criar playlist → adicionar faixa → `GET /playlists/:id` mostra a faixa → remover → lista vazia |
| E5  | favoritar → `GET /favorites` contém a faixa → desfavoritar → 204 → lista vazia                 |
| E6  | usuário A cria playlist; usuário B faz `GET` nela → **404** (não 403)                          |
| E7  | rota protegida sem `Authorization` → 401 com o envelope de erro correto                        |
| E8  | `DELETE /me` → playlists e favoritos do usuário somem (cascade real)                           |
| E9  | sessão por **cookie** (sem Bearer) também autentica `GET /me`                                  |

---

## 5. Casos obrigatórios por tipo de rota

Todo sprint que cria rota deve cobrir, no mínimo:

| Categoria        | Caso                                                               |
| ---------------- | ------------------------------------------------------------------ |
| **Happy path**   | 200/201/204 com o corpo exato da spec `03`                         |
| **Validação**    | payload/param inválido → 400 com `details` preenchido              |
| **Autenticação** | rota protegida sem token → 401                                     |
| **Isolamento**   | recurso de outro usuário → 404                                     |
| **Ausência**     | id inexistente → 404                                               |
| **Conflito**     | duplicata, quando a rota puder gerar → 409                         |
| **Paginação**    | `page=2` devolve a fatia certa; `hasNext` correto na última página |
| **Limite**       | `limit=101` → 400; `limit=100` → 200                               |

---

## 6. Regras invioláveis

1. **Nenhum teste depende da ordem de execução** de outro.
2. **Nenhum teste usa o banco de desenvolvimento.** `DATABASE_URL` de teste vem do
   Testcontainers, em runtime.
3. **Nenhum segredo real** em fixture. Senha de teste: `"test-password-123"`.
4. **Nenhum `sleep` fixo.** Espera é por condição (`vi.waitFor`) ou por promessa.
5. **Nenhum teste do que a lib garante.** Não teste se o Zod valida ou se o Drizzle
   monta SQL — teste a **sua** regra.
6. **Nenhum snapshot de payload inteiro.** Asserção nomeada em campo, para o diff do PR
   dizer o que quebrou.

---

## 7. Portões de qualidade

Sequência obrigatória antes de qualquer commit. **Falhou, parou** — não siga para o próximo.

```bash
pnpm typecheck   # tsc --noEmit — zero erro
pnpm lint        # eslint . — zero erro (warning permitido)
pnpm format      # prettier . --write
pnpm test        # vitest run — tudo verde
pnpm build       # tsup — bundle gerado
```

`.husky/pre-commit` roda `lint-staged` (ESLint + Prettier no que está staged).
`.husky/commit-msg` roda `commitlint`. Os hooks são uma rede, **não** substituem rodar a
sequência acima à mão antes do push.

---

## 8. O que NÃO fazer para "deixar verde"

Estes atalhos são reprovação automática na revisão do PR:

| Atalho                                                | Por quê é proibido                                 |
| ----------------------------------------------------- | -------------------------------------------------- |
| `it.skip` / `describe.skip` para contornar falha      | Esconde regressão; o CI mente                      |
| `expect(true).toBe(true)` para encher a suíte         | Nenhum valor, custo de manutenção                  |
| `any` ou `@ts-expect-error` para calar o typecheck    | Viola a regra central do projeto                   |
| `eslint-disable` sem comentário justificando          | Fronteira de arquitetura existe por motivo         |
| Aumentar timeout até o flake sumir                    | Trata sintoma; o teste continua não-determinístico |
| `--passWithNoTests` em sprint que deveria criar teste | Faz o portão passar sem prova                      |
| Comentar a asserção que falhou                        | Reprovação imediata                                |

Se um teste não passa e a causa é a **spec** estar errada, o agente **para, registra o
conflito em `DECISIONS.md` e pergunta** — não reescreve a spec sozinho.
