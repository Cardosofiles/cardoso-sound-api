# Plano de Implementação — Sprint F5-S01: OpenAPI: Export, Verificação no CI e Polimento

> **Status:** 🟡 Em Planejamento (Aguardando Autorização Explícita — Parada 1 / Etapa 3 do Protocolo)  
> **Fase:** F5 — Produção · **Sprint:** F5-S01  
> **Branch Alvo:** `feature/f5s01-openapi-e-docs` (a partir de `develop`)  
> **Depende de:** F4-S03 (Suíte E2E concluída)  
> **Entrega:** `docs/openapi.json` versionado e determinístico + script `scripts/export-openapi.ts` + step `--check` no CI ([D-21](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md#d-21)) + suíte T1–T12 (`tests/integration/openapi.test.ts`)  
> **Specs de Referência:**
>
> - [`docs/specs/03-contrato-da-api.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/03-contrato-da-api.md) (§2 — Mapa completo de rotas, §10 — OpenAPI)
> - [`docs/specs/06-git-ci-cd-e-deploy.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/06-git-ci-cd-e-deploy.md) (§5 — CI `.github/workflows/ci.yml`)
> - [`docs/specs/07-protocolo-dos-agentes.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/specs/07-protocolo-dos-agentes.md) (Protocolo de 7 etapas e paradas mandatórias)
> - [`docs/sprints/fase-5-producao/F5-S01-openapi-e-docs.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/docs/sprints/fase-5-producao/F5-S01-openapi-e-docs.md) (Brief canônico do sprint)
> - [`.agents/memory/DECISIONS.md`](file:///run/media/joaocardoso/discoF/Cardosofiles/typescript/back-end/fastify/cardoso-sound-api/.agents/memory/DECISIONS.md) (**D-01**, **D-06**, **D-07**, **D-13**, **D-16**, **D-21**, **D-24**, **D-25**, **D-27**, **D-42**, **D-45**)

---

## 1. Contexto e Objetivos Técnicos

O sprint **F5-S01** inaugura a **Fase 5 (Produção)** da Cardoso Sound API com a formalização e versionamento do seu contrato OpenAPI:

1. **Transformar o contrato da API em artefato versionado e imutável:**
   - Criar `docs/openapi.json` gerado a partir dos esquemas declarativos Zod e Fastify Type Provider.
   - Toda alteração de rotas, parâmetros, cabeçalhos ou formatos de resposta passará a aparecer compulsoriamente no diff de Pull Requests.
2. **Resolver o script de exportação inexistente:**
   - Criar o arquivo `scripts/export-openapi.ts`, hoje referenciado no `package.json` em um diretório `scripts/` inexistente.
3. **Garantir determinismo absoluto na exportação:**
   - Evitar diffs espúrios decorrentes de ordem arbitrária de chaves em objetos JSON ou injeção de variáveis de ambiente dinâmicas (como `env.BETTER_AUTH_URL` em `servers`).
   - Aplicar ordenação recursiva alfabética de chaves de objetos JSON.
4. **Proteção e verificação contínua no CI (GitHub Actions):**
   - Adicionar o passo `pnpm openapi:export -- --check` no workflow `.github/workflows/ci.yml`.
   - Se um desenvolvedor alterar schemas de rotas sem regenerar `docs/openapi.json`, o CI quebra imediatamente.
5. **Polimento minucioso das rotas existentes:**
   - Validar que todas as operações Fastify possuem tags corretas, resumos (`summary`) claros em uma linha, `operationId` camelCase únicos, esquema de `security` para rotas autenticadas e todos os códigos de resposta HTTP possíveis mapeados (adicionando os `400` ausentes por validação de querystring).
6. **Automação da suíte de testes de contrato (T1–T12):**
   - Criar `tests/integration/openapi.test.ts` cobrindo a integridade estrutural do spec gerado, singularidade de identificadores, isolamento de rotas públicas vs protegidas, ausência de `additionalProperties: true` nas respostas e paridade de versão.

---

## 2. Blast Radius Estritamente Fechado

Conforme Seção 4 do sprint brief:

```
blast-radius/
├── Criar:
│   ├── scripts/export-openapi.ts                    # Script de exportação e verificação (--check)
│   ├── docs/openapi.json                            # Contrato OpenAPI 3.0.3 versionado
│   ├── tests/integration/openapi.test.ts            # Casos de teste de conformidade T1 a T12
│   └── docs/agents-plans/plan-f5s01-openapi-e-docs.md # Este documento (Regra 6 do AGENTS.md)
│
├── Editar:
│   ├── .github/workflows/ci.yml                     # Novo passo de verificação no CI após build
│   ├── package.json                                 # Ajuste dos scripts openapi:export e openapi:check
│   ├── src/plugins/swagger.plugin.ts                # Configuração de servers fixos, tags e documentação de auth
│   ├── src/modules/playlists/playlists.routes.ts    # Adição de 400 no response de R16 (validação de query)
│   ├── src/modules/favorites/favorites.routes.ts    # Adição de 400 no response de R23 (validação de query)
│   ├── .agents/memory/PROGRESS.md                   # Atualização do estado do sprint para F5-S01 concluído
│   ├── .agents/memory/DECISIONS.md                  # Registro da Decisão D-59 (OpenAPI 3.0.3, servers e auth)
│   └── .agents/memory/F5-S01.md                     # Memória técnica detalhada do sprint
│
└── Fora do Escopo (Terminantemente Proibido Alterar):
    ├── src/modules/*/*.service.ts                   # Zero alterações em regras de negócio
    ├── src/modules/*/*.repository.ts                # Zero alterações em queries de persistência
    ├── src/db/**                                    # Zero alterações em schemas ou pool de banco
    └── tests/e2e/**                                 # Suíte E2E permanece intocada
```

> **Atenção sobre `health.plugin.ts`:** O arquivo `src/plugins/health.plugin.ts` já está devidamente configurado com tag `Health`, summaries concisos e operationIds (`getHealth`, `getHealthReady`). Ele não será modificado preservando a aderência estrita ao blast radius.

---

## 3. Especificação Técnica e Contratos de Implementação

### 3.1 `scripts/export-openapi.ts`

O script deve carregar a aplicação Fastify sem subir servidor HTTP e sem exigir Postgres ativo em rede:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/client.js';

// Previne disparo de timers em background do underPressurePlugin
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export async function generateOpenApiSpec(): Promise<string> {
  const app = await buildApp();
  try {
    await app.ready();
    const rawSpec = app.swagger();
    const sortedSpec = sortObjectKeys(rawSpec);
    return JSON.stringify(sortedSpec, null, 2) + '\n';
  } finally {
    await app.close();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const isCheck = process.argv.includes('--check');
  const targetPath = resolve(process.cwd(), 'docs/openapi.json');

  const generatedJson = await generateOpenApiSpec();

  if (isCheck) {
    const currentJson = await readFile(targetPath, 'utf8').catch(() => '');
    if (currentJson !== generatedJson) {
      console.error(
        '❌ docs/openapi.json está desatualizado em relação às rotas da aplicação.\n' +
          'Execute "pnpm openapi:export" para atualizar o contrato versionado.',
      );
      process.exit(1);
    }
    console.log('✅ docs/openapi.json está atualizado e em conformidade com as rotas.');
    process.exit(0);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, generatedJson, 'utf8');
  console.log(`✅ Especificação OpenAPI exportada com sucesso para ${targetPath}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
```

#### Fatores de Blindagem contra Armadilhas:

- **Encerramento limpo:** Execução de `await app.close()` e `await pool.end()` dentro de bloco `finally` garante que o processo Node encerre sem sockets pendentes (evita a Armadilha 3 do sprint brief).
- **Determinismo garantido:** Função recursiva `sortObjectKeys` organiza as chaves em ordem alfabética estável, garantindo que execuções repetidas gerem diff zero.
- **Funcionamento sem banco:** Atribuição preventiva `process.env.NODE_ENV = 'test'` desabilita o intervalo de healthcheck de `underPressurePlugin`.

---

### 3.2 `src/plugins/swagger.plugin.ts`

Ajustes nos metadados OpenAPI:

1. **Servers estáveis:** Fixar `url: 'http://localhost:3333'` com descrição `'Local'`. Não utilizar `env.BETTER_AUTH_URL` para impedir vazamento de URLs ou inconsistência entre ambientes.
2. **Documentação transparente das rotas de autenticação:** Incluir na descrição principal (`info.description`) o esclarecimento de que as rotas `/api/auth/*` são gerenciadas pelo Better Auth via handler curinga (conforme D-45) e aceitam Bearer tokens e cookies HTTP-only.
3. **Tags e Security Schemes:** Manter as 5 tags (`Health`, `Auth`, `Catalog`, `Profile`, `Library`) e os schemes `bearerAuth` e `cookieAuth`.

```typescript
openapi: {
  openapi: '3.0.3',
  info: {
    title: APP_NAME,
    version: pkg.version,
    description:
      'API de catálogo musical para o app Flutter. ' +
      'As rotas de autenticação (/api/auth/*) são gerenciadas pelo Better Auth com suporte simultâneo a Bearer Token e Cookie HttpOnly.',
  },
  servers: [
    { url: 'http://localhost:3333', description: 'Local' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness e readiness' },
    { name: 'Auth', description: 'Cadastro, login e sessão' },
    { name: 'Catalog', description: 'Faixas, artistas e gêneros (público)' },
    { name: 'Profile', description: 'Perfil do usuário autenticado' },
    { name: 'Library', description: 'Playlists e favoritos' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Bearer token gerado pelo Better Auth (usado pelo app Flutter)',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
        description: 'Cookie de sessão httpOnly do Better Auth (usado pelo Swagger UI)',
      },
    },
  },
}
```

---

### 3.3 Polimento das Rotas (`src/modules/*/*.routes.ts`)

Inventário das 14 rotas Fastify (20 operações HTTP) documentadas via Zod:

| Rota                                      | Método | operationId               | Tag       | Status Declarados            | Security |
| ----------------------------------------- | ------ | ------------------------- | --------- | ---------------------------- | -------- |
| `/health`                                 | GET    | `getHealth`               | `Health`  | 200                          | ❌       |
| `/health/ready`                           | GET    | `getHealthReady`          | `Health`  | 200, 503                     | ❌       |
| `/api/v1/artists`                         | GET    | `listArtists`             | `Catalog` | 200, 400                     | ❌       |
| `/api/v1/artists/{id}`                    | GET    | `getArtistById`           | `Catalog` | 200, 400, 404                | ❌       |
| `/api/v1/tracks`                          | GET    | `listTracks`              | `Catalog` | 200, 400                     | ❌       |
| `/api/v1/tracks/{id}`                     | GET    | `getTrackById`            | `Catalog` | 200, 400, 404                | ❌       |
| `/api/v1/genres`                          | GET    | `listGenres`              | `Catalog` | 200                          | ❌       |
| `/api/v1/me`                              | GET    | `getMe`                   | `Profile` | 200, 401                     | ✅       |
| `/api/v1/me`                              | PATCH  | `updateMe`                | `Profile` | 200, 400, 401                | ✅       |
| `/api/v1/me`                              | DELETE | `deleteMe`                | `Profile` | 204, 401                     | ✅       |
| `/api/v1/playlists`                       | GET    | `listPlaylists`           | `Library` | 200, **400**, 401            | ✅       |
| `/api/v1/playlists`                       | POST   | `createPlaylist`          | `Library` | 201, 400, 401, 422           | ✅       |
| `/api/v1/playlists/{id}`                  | GET    | `getPlaylistById`         | `Library` | 200, 400, 401, 404           | ✅       |
| `/api/v1/playlists/{id}`                  | PATCH  | `updatePlaylist`          | `Library` | 200, 400, 401, 404           | ✅       |
| `/api/v1/playlists/{id}`                  | DELETE | `deletePlaylist`          | `Library` | 204, 400, 401, 404           | ✅       |
| `/api/v1/playlists/{id}/tracks`           | POST   | `addTrackToPlaylist`      | `Library` | 201, 400, 401, 404, 409, 422 | ✅       |
| `/api/v1/playlists/{id}/tracks/{trackId}` | DELETE | `removeTrackFromPlaylist` | `Library` | 204, 400, 401, 404           | ✅       |
| `/api/v1/favorites`                       | GET    | `listFavorites`           | `Library` | 200, **400**, 401            | ✅       |
| `/api/v1/favorites/{trackId}`             | POST   | `addFavorite`             | `Library` | 201, 400, 401, 404, 409      | ✅       |
| `/api/v1/favorites/{trackId}`             | DELETE | `removeFavorite`          | `Library` | 204, 400, 401, 404           | ✅       |

#### Ajustes cirúrgicos a aplicar:

1. `src/modules/playlists/playlists.routes.ts`: Na rota `GET /playlists` (R16), acrescentar `400: errorResponseSchema` no mapeamento de `response` (hoje tem apenas `200` e `401`, omitindo erro de validação da querystring de paginação).
2. `src/modules/favorites/favorites.routes.ts`: Na rota `GET /favorites` (R23), acrescentar `400: errorResponseSchema` no mapeamento de `response` (hoje tem apenas `200` e `401`, omitindo erro de validação da querystring de paginação).

---

### 3.4 `package.json` e `.github/workflows/ci.yml`

1. **`package.json`:**
   Adicionar script explícito de checagem para conveniência do desenvolvedor e garantir suporte completo a argumentos:
   ```json
   "openapi:export": "tsx scripts/export-openapi.ts",
   "openapi:check": "tsx scripts/export-openapi.ts --check"
   ```
2. **`.github/workflows/ci.yml`:**
   Inserir o step após o `Build`:
   ```yaml
   - name: Build
     run: pnpm build

   - name: Verify OpenAPI specification
     run: pnpm openapi:export -- --check
   ```

---

## 4. Matriz de Testes de Integração (`tests/integration/openapi.test.ts`)

A suíte executará de forma autônoma sem necessidade de Testcontainers, validando as 12 asserções obrigatórias:

| #       | Caso                                                  | Asserção Implementada                                                                                                                                  |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T1**  | Spec válido                                           | `expect(spec.openapi).toBe('3.0.3'); expect(spec.info).toBeDefined(); expect(spec.paths).toBeDefined();`                                               |
| **T2**  | Todas as rotas aparecem                               | `expect(Object.keys(spec.paths).sort()).toEqual(EXPECTED_PATHS.sort())` contra lista literal de 14 caminhos.                                           |
| **T3**  | Toda operação tem `operationId`                       | Itera por cada método em `paths` e valida `expect(typeof op.operationId).toBe('string')` e `expect(op.operationId.length).toBeGreaterThan(0)`.         |
| **T4**  | `operationId` são únicos                              | Extrai todos os IDs e valida `expect(new Set(ids).size).toBe(ids.length)`.                                                                             |
| **T5**  | Toda operação tem tag válida                          | Valida `Array.isArray(op.tags)` e `expect(op.tags.length).toBeGreaterThan(0)`, todos contidos no conjunto permitido.                                   |
| **T6**  | Rotas protegidas têm `security`                       | As 13 operações de `Profile` e `Library` possuem `security: [{ bearerAuth: [] }, { cookieAuth: [] }]`.                                                 |
| **T7**  | Rotas públicas não têm `security`                     | As 7 operações de `Health` e `Catalog` têm `op.security === undefined`.                                                                                |
| **T8**  | `securitySchemes` configurados                        | `expect(spec.components.securitySchemes.bearerAuth).toBeDefined(); expect(spec.components.securitySchemes.cookieAuth).toBeDefined();`                  |
| **T9**  | Determinismo                                          | Duas execuções consecutivas de `generateOpenApiSpec()` produzem strings exatamente idênticas.                                                          |
| **T10** | `docs/openapi.json` commitado bate com o gerado       | Lê `docs/openapi.json` do disco e compara byte a byte com o spec gerado em runtime.                                                                    |
| **T11** | `info.version` igual ao `package.json`                | `expect(spec.info.version).toBe(pkg.version)`.                                                                                                         |
| **T12** | Ausência de `additionalProperties: true` em responses | Varredura recursiva em todos os responses de `paths` e `components.schemas` garantindo que nenhuma propriedade possui `additionalProperties === true`. |

---

## 5. Sequência de Execução Passo a Passo (Etapa 4 — Implementar)

1. **Criação da Branch:**
   ```bash
   git checkout -b feature/f5s01-openapi-e-docs
   ```
2. **Ajuste de Metadados e Schemas de Rotas:**
   - Atualizar `src/plugins/swagger.plugin.ts` (servers fixos e descrição com esclarecimento de auth).
   - Ajustar `src/modules/playlists/playlists.routes.ts` (adicionar 400 em R16).
   - Ajustar `src/modules/favorites/favorites.routes.ts` (adicionar 400 em R23).
3. **Criação do Script de Exportação:**
   - Criar `scripts/export-openapi.ts` com função estável de ordenação de chaves e tratamento de `--check`.
4. **Atualização de Scripts no `package.json`:**
   - Adicionar `"openapi:check": "tsx scripts/export-openapi.ts --check"`.
5. **Geração do Artefato `docs/openapi.json`:**
   - Executar `pnpm openapi:export`.
   - Executar `git diff --exit-code docs/openapi.json` para testar determinismo.
6. **Implementação da Suíte de Testes:**
   - Criar `tests/integration/openapi.test.ts` cobrindo T1 a T12.
7. **Atualização do Workflow CI:**
   - Adicionar o passo `pnpm openapi:export -- --check` em `.github/workflows/ci.yml`.
8. **Validação dos Portões de Qualidade Locais (Etapa 5 — Validar):**
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format`
   - `pnpm test` (unitários + integração + E2E)
   - `pnpm build`
9. **Comprovação do CI Vermelho:**
   - Testar intencionalmente alterando um texto no spec para verificar que `pnpm openapi:export -- --check` falha com código diferente de zero, e em seguida restaurar.

---

## 6. Registro de Memória (Etapa 7 — Registrar)

1. **`.agents/memory/DECISIONS.md`:**
   - Registro de **D-59**: OpenAPI 3.0.3 emitido, servers fixados em `localhost:3333`, tratamento de rotas Better Auth na documentação e ordenação recursiva determinística de chaves no exportador.
2. **`.agents/memory/PROGRESS.md`:**
   - Sprint F5-S01 marcado como concluído ✅.
   - Próximo sprint: F5-S02 (Blindagem de borda e rate limiting).
   - Adição do artefato OpenAPI em contratos entregues.
3. **`.agents/memory/F5-S01.md`:**
   - Criação a partir de `_TEMPLATE.md` detalhando comandos de verificação, determinismo e decisões adotadas.
