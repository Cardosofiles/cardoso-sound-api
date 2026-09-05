# F5-S01 — OpenAPI: Export, Verificação no CI e Polimento

|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| **Fase**       | F5 — Produção                                                    |
| **Branch**     | `feature/f5s01-openapi-e-docs`                                   |
| **Depende de** | F4-S03                                                           |
| **Entrega**    | `docs/openapi.json` versionado + job de verificação no CI (D-21) |

---

## 1. Prompt de abertura

```
Leia .agents/memory/PROGRESS.md e .agents/memory/DECISIONS.md para se contextualizar.

Sprint alvo: docs/sprints/fase-5-producao/F5-S01-openapi-e-docs.md
Specs obrigatórias: docs/specs/03-contrato-da-api.md (INTEIRA, especialmente §10),
                    docs/specs/06-git-ci-cd-e-deploy.md (§5)

Siga o protocolo de docs/specs/07-protocolo-dos-agentes.md:
entre em modo de planejamento, apresente o plano COMPLETO da sprint e
AGUARDE minha autorização explícita antes de escrever qualquer código.

Não toque em nenhum arquivo fora do blast radius declarado no sprint.
```

---

## 2. Objetivo

Transformar o contrato da API em **artefato versionado e verificável**: um `openapi.json`
commitado que o CI regenera e compara, de modo que toda mudança de contrato apareça no
diff do PR.

Resolve também o script `openapi:export` do `package.json`, que hoje aponta para
`scripts/export-openapi.ts` — e `scripts/` **não existe**.

Inclui uma passada de polimento: conferir que as 25 rotas estão documentadas com tag,
summary, operationId, security e todos os status possíveis.

---

## 3. Contratos esperados

### `scripts/export-openapi.ts`

```bash
tsx scripts/export-openapi.ts            # escreve docs/openapi.json
tsx scripts/export-openapi.ts --check    # não escreve; sai != 0 se houver diferença
```

Usa `buildApp()` + `await app.ready()` + `app.swagger()`. **Não abre porta e não precisa
de banco** — se `buildApp()` exigir conexão, ajuste para que o export funcione sem
Postgres de pé, ou documente a dependência.

Saída: JSON com indentação 2 e **chaves ordenadas de forma estável**, senão cada execução
gera um diff espúrio e o `--check` vira ruído.

### `docs/openapi.json`

Commitado. `openapi: 3.1.x` (ou 3.0.x, conforme o `@fastify/swagger` gerar — registre qual),
`info.version` igual ao `package.json`, as 25 rotas da spec `03` §2, e
`components.securitySchemes` com `bearerAuth` e `cookieAuth`.

### `.github/workflows/ci.yml`

Passo novo, depois de `build`:

```yaml
- run: pnpm openapi:export -- --check
```

---

## 4. Blast radius

### Criar

```
scripts/export-openapi.ts
docs/openapi.json
tests/integration/openapi.test.ts
```

### Editar

```
.github/workflows/ci.yml               # passo de verificação
package.json                           # ajustar o script openapi:export se necessário
src/plugins/swagger.plugin.ts          # metadados, servers, securitySchemes
src/modules/*/*.routes.ts              # SOMENTE metadados de schema — ver §5.4
.agents/memory/PROGRESS.md
.agents/memory/F5-S01.md
```

**Não toque em:** lógica de service, repository, schema Zod de validação (só os
`.describe()` e os metadados de rota) · `src/db/**` · `tests/e2e/**`.

> Se o polimento revelar que uma rota devolve status não declarado, isso é **mudança de
> contrato**: pare e reporte, não altere a rota por conta própria.

---

## 5. Passo a passo

### 5.1 Script de export

```ts
const app = await buildApp();
await app.ready();
const spec = app.swagger();
const json = JSON.stringify(spec, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = await readFile('docs/openapi.json', 'utf8').catch(() => '');
  if (current !== json) {
    /* imprime diff resumido, process.exit(1) */
  }
  process.exit(0);
}
await writeFile('docs/openapi.json', json);
await app.close();
```

`await app.close()` no fim, senão o processo não encerra.

**Estabilidade da saída** é o requisito crítico: rode duas vezes e confirme
`git diff --exit-code`. Se der diff, algo é não-determinístico (data, ordem de chaves,
versão) — resolva antes de commitar.

### 5.2 `package.json`

O script atual é `tsx scripts/export-openapi.ts`. Para o `--check` funcionar via
`pnpm openapi:export -- --check`, confirme o repasse de argumentos. Se atrapalhar, crie
um segundo script `openapi:check`.

### 5.3 `swagger.plugin.ts`

```ts
openapi: {
  info: { title: 'Cardoso Sound API', version: pkg.version,
          description: 'API de catálogo musical para o app Flutter.' },
  servers: [
    { url: 'http://localhost:3333', description: 'Local' },
    { url: env.BETTER_AUTH_URL,     description: 'Produção' },
  ],
  tags: [
    { name: 'Health',  description: 'Liveness e readiness' },
    { name: 'Auth',    description: 'Cadastro, login e sessão' },
    { name: 'Catalog', description: 'Faixas, artistas e gêneros (público)' },
    { name: 'Profile', description: 'Perfil do usuário autenticado' },
    { name: 'Library', description: 'Playlists e favoritos' },
  ],
  components: { securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer' },
    cookieAuth: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
  }},
}
```

> `servers` com `env.BETTER_AUTH_URL` faz a URL de produção vazar para o JSON gerado em
> máquinas diferentes, criando diff instável. **Use um valor fixo** ou omita o segundo
> server até F5-S02. Registre a escolha.

### 5.4 Polimento das rotas

Percorra as 25 rotas da spec `03` §2 e confirme, uma a uma:

- [ ] `tags` correto
- [ ] `summary` em português, uma linha
- [ ] `operationId` único, camelCase (`listTracks`, `getMe`, `addTrackToPlaylist`)
- [ ] `security` nas protegidas
- [ ] `response` com **todos** os status que a rota pode emitir
- [ ] `.describe()` nos campos principais dos schemas

**Só metadados.** Nenhuma mudança de comportamento neste sprint.

### 5.5 Teste do contrato

`tests/integration/openapi.test.ts` valida a estrutura do spec gerado — ver §6.

---

## 6. Casos de teste obrigatórios

| #   | Caso                                                       | Esperado                                         |
| --- | ---------------------------------------------------------- | ------------------------------------------------ |
| T1  | `app.swagger()` gera spec válido                           | tem `openapi`, `info`, `paths`                   |
| T2  | Todas as rotas da spec `03` §2 aparecem                    | comparar chaves de `paths` com uma lista literal |
| T3  | Toda operação tem `operationId`                            | nenhuma vazia                                    |
| T4  | `operationId` são únicos                                   | `new Set(ids).size === ids.length`               |
| T5  | Toda operação tem ao menos um `tag`                        |                                                  |
| T6  | Rotas protegidas têm `security`                            | as 13 rotas de `Profile` + `Library`             |
| T7  | Rotas públicas **não** têm `security`                      | catálogo e health                                |
| T8  | `securitySchemes` tem `bearerAuth` e `cookieAuth`          |                                                  |
| T9  | Export rodado 2× produz bytes idênticos                    | determinismo                                     |
| T10 | `docs/openapi.json` commitado bate com o gerado            | é o próprio `--check`                            |
| T11 | `info.version` igual ao `package.json`                     |                                                  |
| T12 | Nenhum schema com `additionalProperties: true` em response | prova a poda do serializer                       |

---

## 7. Definition of Done

```bash
pnpm openapi:export
git diff --exit-code docs/openapi.json      # 2ª execução: sem diff
pnpm openapi:export -- --check              # sai 0
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
pnpm dev && open http://localhost:3333/docs
```

- [ ] T1–T12 verdes
- [ ] `docs/openapi.json` commitado; export é determinístico
- [ ] Passo `--check` no `ci.yml`, e **provado que ele falha**: altere um `summary`, veja
      o CI vermelho, reverta
- [ ] As 25 rotas com tag, summary, operationId, security e todos os status
- [ ] Swagger UI navegável; "Try it out" funciona nas rotas públicas
- [ ] PR verde; memória atualizada

---

## 8. Armadilhas conhecidas

1. **Export não-determinístico** transforma o `--check` em falha aleatória. Causas comuns:
   `servers` derivado de env, timestamp no `info`, ordem de chaves instável.
2. **`app.swagger()` antes de `app.ready()`** devolve spec incompleto, sem as rotas.
3. **Processo que não encerra** — falta `app.close()`, ou o pool do `client.ts` continua
   aberto. Se o script pendurar no CI, é isso.
4. **`pnpm run script -- --flag`** nem sempre repassa o argumento como esperado. Teste
   antes; se falhar, crie `openapi:check` como script próprio.
5. **Mudar comportamento de rota "de passagem"** neste sprint escapa da revisão que o
   sprint original teve. Só metadados.
6. **`@fastify/swagger` pode emitir 3.0 ou 3.1** conforme a config. Registre qual, porque
   geradores de client Flutter tratam os dois de forma diferente.
7. **Rotas do Better Auth** não são geradas pelo Zod e podem não aparecer no spec. Isso é
   esperado — documente-as manualmente na descrição ou aceite a ausência, mas **registre
   a decisão**.

---

## 9. Registro na memória

- **`DECISIONS.md`** — versão do OpenAPI emitida; o que foi feito com `servers`; se as
  rotas do Better Auth entraram no spec.
- **`PROGRESS.md`** — F5-S01 ✅, próximo = F5-S02.
- **`F5-S01.md`** — como o determinismo foi garantido e o comando exato do `--check`.
