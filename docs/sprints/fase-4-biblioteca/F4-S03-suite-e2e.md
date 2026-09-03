# F4-S03 — Suíte E2E dos Fluxos Completos

|                |                                             |
| -------------- | ------------------------------------------- |
| **Fase**       | F4 — Biblioteca · **último sprint da fase** |
| **Branch**     | `feature/f4s03-suite-e2e`                   |
| **Depende de** | F4-S01 **e** F4-S02                         |
| **Entrega**    | E1–E9 · tag `v0.4.0`                        |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.
Leia também .agents/memory/F3-S01.md (helper signUpAndGetToken) e
.agents/memory/F2-S02.md (harness startTestDatabase).

Sprint alvo: docs/sprints/fase-4-biblioteca/F4-S03-suite-e2e.md
Specs obrigatórias: docs/specs/05-testes-e-qualidade.md (§4, §6)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Provar que a API funciona **como o app Flutter vai usá-la**: fluxos inteiros atravessando
auth, catálogo e biblioteca, via `app.inject()` — sem servidor, sem porta, sem browser
(D-03).

Os testes de integração dos sprints anteriores provaram cada peça isoladamente. Este
sprint prova que elas se encaixam.

**Este sprint não corrige código de produção.** Se um teste E2E revelar bug, o agente
**para e reporta** — a correção é um sprint próprio ou uma autorização explícita sua.

---

## 3. Contratos esperados

Nenhuma rota nova. A entrega são os 9 fluxos da **spec `05` §4**:

| #   | Fluxo                                                                            |
| --- | -------------------------------------------------------------------------------- |
| E1  | sign-up → `GET /me` com Bearer → 200 com o e-mail correto                        |
| E2  | sign-in com senha errada → 401                                                   |
| E3  | `GET /api/v1/tracks` sem token → 200 e catálogo populado                         |
| E4  | criar playlist → adicionar faixa → `GET /playlists/:id` mostra → remover → vazia |
| E5  | favoritar → `GET /favorites` contém → desfavoritar → 204 → vazia                 |
| E6  | A cria playlist; B faz `GET` nela → **404**                                      |
| E7  | rota protegida sem `Authorization` → 401 com o envelope correto                  |
| E8  | `DELETE /me` → playlists e favoritos do usuário somem                            |
| E9  | sessão por **cookie** (sem Bearer) autentica `GET /me`                           |

---

## 4. Blast radius

### Criar

```
tests/e2e/specs/auth-flow.e2e.test.ts          # E1, E2, E7, E9
tests/e2e/specs/catalog-flow.e2e.test.ts       # E3
tests/e2e/specs/playlist-flow.e2e.test.ts      # E4, E6
tests/e2e/specs/favorites-flow.e2e.test.ts     # E5
tests/e2e/specs/account-lifecycle.e2e.test.ts  # E8
tests/e2e/helpers/app.ts                       # buildTestApp()
```

### Editar

```
tests/e2e/helpers/auth.ts       # se precisar de cookie além de bearer
tests/e2e/specs/.gitkeep        # remover
.agents/memory/PROGRESS.md
.agents/memory/F4-S03.md
```

**Não toque em nada de `src/`.** Este sprint escreve teste, não código de produção.
Se `src/` precisar mudar, **pare e reporte**.

---

## 5. Passo a passo

### 5.1 `tests/e2e/helpers/app.ts`

```ts
export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  db: Database;
  stop: () => Promise<void>;
}>;
```

Sobe o Testcontainers (F2-S02), aponta `DATABASE_URL` para ele, roda `seed()` e
constrói `buildApp()`.

**Problema a resolver:** `src/db/client.ts` cria o pool no import, a partir de
`env.DATABASE_URL`. O teste precisa que ele aponte para o container. Duas saídas —
**escolha e registre em `DECISIONS.md`**:

- (a) definir `process.env.DATABASE_URL` **antes** de importar `client.ts`, usando
  `await import()` dinâmico depois de o container subir
- (b) um `globalSetup` do Vitest que sobe um container único para toda a suíte E2E e
  exporta a `DATABASE_URL` antes de qualquer módulo carregar

Prefira **(b)**: mais limpo, um container só para os 5 arquivos, suíte bem mais rápida.
`globalSetup` roda antes de tudo e é o mecanismo previsto pelo Vitest para isso.

Se nenhuma das duas funcionar sem alterar `src/`, **pare e reporte** — pode ser que
`client.ts` precise virar lazy, e isso é mudança de produção.

### 5.2 Isolamento

- Cada arquivo `.e2e.test.ts` é independente e pode rodar sozinho.
- `beforeEach` → `truncateAll` + `seed()` (o catálogo precisa existir).
- Cada teste cria **seus próprios usuários**, com e-mail único
  (`user-${crypto.randomUUID()}@teste.local`).
- **Nenhum teste depende de outro.** Rode `--sequence.shuffle` uma vez para provar.

### 5.3 Escrita dos fluxos

Cada fluxo é **um** `it()` com passos encadeados e asserção em cada passo — não quebre
E4 em cinco `it()` independentes, porque o valor está na sequência.

```ts
it('E4: cria playlist, adiciona faixa, remove e esvazia', async () => {
  const { token } = await signUpAndGetToken(app);
  const auth = { authorization: `Bearer ${token}` };

  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/playlists',
    headers: auth,
    payload: { name: 'Treino' },
  });
  expect(created.statusCode).toBe(201);
  const playlistId = created.json<{ id: string }>().id;
  // …
});
```

Asserção **por campo nomeado**, nunca snapshot do payload inteiro (spec `05` §6).

### 5.4 E9 — cookie

Extraia o `set-cookie` da resposta de sign-up e reenvie como header `cookie`.
`app.inject()` não tem cookie jar; a montagem é manual:

```ts
const raw = signUp.headers['set-cookie'];
const cookie = (Array.isArray(raw) ? raw : [raw]).map((c) => c.split(';')[0]).join('; ');
const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
```

Se `set-cookie` vier como string única quando deveria ser array, o bug é da ponte de
F3-S01 — **pare e reporte**, não contorne no teste.

### 5.5 E7 — envelope de erro

Verifique as **quatro** chaves e nada mais:

```ts
expect(res.json()).toEqual({
  statusCode: 401,
  error: 'Unauthorized',
  message: expect.any(String),
  details: null,
});
```

### 5.6 Tempo da suíte

Meta da spec `05` §1: **< 45 s** para o project `e2e`. Se passar disso, o provável culpado
é container por arquivo em vez de `globalSetup`. Registre o tempo real.

---

## 6. Casos de teste obrigatórios

Os 9 fluxos da §3, mais estes reforços:

| #   | Caso                                                    | Esperado                   |
| --- | ------------------------------------------------------- | -------------------------- |
| E10 | Todo fluxo roda com a suíte embaralhada                 | `--sequence.shuffle` passa |
| E11 | Rodar a suíte E2E duas vezes seguidas                   | passa nas duas             |
| E12 | Nenhum e-mail hardcodado colide entre arquivos          | uuid no e-mail             |
| E13 | Envelope de erro idêntico em 401, 404 e 409             | mesmas 4 chaves            |
| E14 | `GET /api/v1/tracks` devolve `audioUrl` de URL absoluta | regex de `https://`        |
| E15 | Rate limit **não** dispara durante a suíte              | nenhum 429 (D-19)          |

---

## 7. Definition of Done

```bash
docker info >/dev/null                      # daemon ativo
pnpm typecheck && pnpm lint && pnpm format
pnpm vitest run --project e2e
pnpm vitest run --project e2e --sequence.shuffle
pnpm test && pnpm build
```

- [ ] E1–E15 verdes
- [ ] Suíte E2E embaralhada passa (E10)
- [ ] Suíte E2E abaixo de 45 s — tempo real registrado
- [ ] **Zero alteração em `src/`** (confirme com `git diff --stat src/`)
- [ ] Nenhum `it.skip`, nenhum snapshot de payload inteiro, nenhum `sleep`
- [ ] `.gitkeep` de `tests/e2e/specs/` removido
- [ ] PR verde; `release/v0.4.0` preparada e PR para `main` aberto
- [ ] Memória atualizada

---

## 8. Armadilhas conhecidas

1. **`src/db/client.ts` cria o pool no import.** É o obstáculo central deste sprint (§5.1).
   Resolva com `globalSetup`, não alterando `src/`.
2. **Um container por arquivo** multiplica o tempo por 5. `globalSetup` sobe um só.
3. **E-mail fixo entre arquivos** faz o segundo sign-up falhar com "já cadastrado", e o
   sintoma parece bug da API. Sempre uuid.
4. **`app.inject()` não gerencia cookie.** Monte o header à mão (§5.4).
5. **`app.close()` faltando no `afterAll`** deixa handle aberto e o Vitest não encerra.
6. **Seed não rodado no `beforeEach`** faz E3 e E4 falharem por catálogo vazio — e a
   mensagem não deixa isso óbvio.
7. **Corrigir `src/` "só um pouquinho"** para o teste passar transforma um sprint de
   verificação em sprint de implementação, sem revisão. Se achou bug, **reporte**.
8. **Ordem de `truncateAll` e `seed`**: truncar depois de semear apaga o catálogo. Truncar
   **antes**, sempre.

---

## 9. Registro na memória

- **`DECISIONS.md`** — **obrigatório**: a solução de §5.1 (`globalSetup` ou import
  dinâmico). Afeta todo teste E2E futuro.
- **`PROGRESS.md`** — F4-S03 ✅, **fase F4 concluída**, tag `v0.4.0`, próximo = F5-S01.
  Se algum bug foi encontrado e **não** corrigido, registre como bloqueio.
- **`F4-S03.md`** — o mecanismo de `globalSetup`, o tempo da suíte, e a lista de bugs
  encontrados (corrigidos ou reportados).
