---
paths:
  - 'tsconfig.json'
  - 'src/**/*.ts'
---

# TypeScript conventions

> **Overlap.** `.agents/rules/coding-standards.md` covers naming, suffixes and layering, and is
> already accurate for this repository. Keep this file only for what it adds — strictness,
> narrowing and type derivation — or fold it in. Two files describing the same conventions will
> drift.

## Compiler settings — what is actually configured

These are not aspirations; they are in `tsconfig.json` today. Do not propose changing one to make a
file compile — fix the file.

| Flag                          | Value      | Consequence                                     |
| ----------------------------- | ---------- | ----------------------------------------------- |
| `strict`                      | `true`     | the floor, not the ceiling                      |
| `module` / `moduleResolution` | `NodeNext` | native ESM                                      |
| `noUncheckedIndexedAccess`    | `true`     | indexed access yields `T \| undefined`, not `T` |
| `verbatimModuleSyntax`        | `true`     | a type-only import **must** be `import type`    |
| `exactOptionalPropertyTypes`  | `false`    | **closed by D-34** — do not reopen              |

## Imports and modules

- **Relative imports carry the `.js` extension.** `NodeNext` requires it:
  `import { buildApp } from './app.js'`. This is the opposite of a bundler setup — a suggestion to
  drop the extension is a suggestion to break the runtime.
- **There is no `@/` alias.** `tsconfig.json` declares no `paths`. Use relative imports.
- `import type { X } from '...'` for type-only imports. With `verbatimModuleSyntax` this is
  enforced, not stylistic.
- Layer boundaries are enforced at lint time by `eslint-plugin-boundaries`:
  `*.routes.ts → *.service.ts → *.repository.ts → src/db/`. A violation fails `pnpm lint`. The
  repository layer is the only one that may import `src/db/`.

## No `any`

Zero `any` in application code — it is a hard ESLint error. An uncertain boundary (third-party
response, `JSON.parse`, a body before validation) is `unknown`, narrowed with Zod or a type guard
before any use.

`as` is acceptable only with a short comment explaining why the manual narrowing is sound. `as`
without a comment means the type should have been proven, not asserted. The same applies to the
non-null assertion `!` — uncommented, it is a bet that becomes a runtime `TypeError`.

## Derive types, never hand-write them

- Request/response DTOs: `z.infer<typeof schema>` from the Zod schema. Never a parallel `interface`
  that can drift from the schema the route actually validates against.
- Table rows: `typeof table.$inferSelect` / `typeof table.$inferInsert` from Drizzle.

`*.schema.ts` is an overloaded suffix: a Zod DTO under `src/modules/**`, a Drizzle table under
`src/db/schema/`. When a concept needs to exist in both worlds, derive one from the other — never
maintain two independent definitions.

## Unions and enums

Prefer a union of literals (`'pending' | 'active' | 'closed'`) or Drizzle's `pgEnum` over a
TypeScript `enum`: `enum` emits a runtime JS artifact and does not map 1:1 onto a Postgres type.
Note that `genre` is deliberately a `varchar(40)` slug on `tracks`, not an enum (D-12).

A `switch` over a discriminated union ends with a `default` that assigns the value to `never`, so
adding a variant and forgetting a case breaks the build instead of production.

## Other

- `satisfies` to check an object literal against a shape without widening the inferred type.
- Declare the return type of an exported function when inference is not obvious — it confines a
  type error to one file instead of propagating it through every caller.
- Services must be pure with respect to HTTP: they never touch `request` or `reply`. That is what
  keeps them unit-testable against a stubbed repository.
- `no-console` is a hard error in `src/**`; log through `request.log.*` / `fastify.log.*`. Reading
  `process.env` is likewise an error everywhere except `src/config/env.ts`.
