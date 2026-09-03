# Coding Standards & TypeScript Conventions

Guidelines and constraints for writing clean, performant, and type-safe code tailored for the **Gemini 3.8 Flash** model execution.

## 1. TypeScript & Strictness

- Strict mode is enabled (`strict: true`). Avoid using `any` under all circumstances; use `unknown` with type guards or proper generic types.
- Export all input and output types derived from Zod schemas using `z.infer<typeof schema>`.
- Use ES Modules syntax exclusively (`import` / `export`). Ensure compatibility with `NodeNext` resolution and `package.json` `"type": "module"`.

## 2. Naming Conventions

- **Files**: Kebab-case with type suffix:
  - `*.routes.ts` for Fastify route plugins
  - `*.service.ts` for business logic services
  - `*.repository.ts` for data access repositories
  - `*.schema.ts` for Zod schemas and Drizzle table definitions
  - `*.plugin.ts` for Fastify plugins
  - `*.error.ts` for custom error classes
- **Classes & Types**: PascalCase (e.g., `TracksService`, `AppError`, `CreatePlaylistInput`).
- **Functions, Methods, Variables**: camelCase (e.g., `findTrackById`, `durationSeconds`).
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_PAGE_SIZE`, `APP_NAME`).
- **Database Tables & Columns**: snake_case for PostgreSQL tables and column identifiers (e.g., `playlist_tracks`, `duration_seconds`).

## 3. Fastify Route Standards

- Always type route handlers with `fastify-type-provider-zod`:
  ```typescript
  import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

  export const tracksRoutes: FastifyPluginAsyncZod = async (fastify) => {
    fastify.get(
      '/api/tracks',
      {
        schema: {
          querystring: listTracksQuerySchema,
          response: { 200: listTracksResponseSchema },
        },
      },
      async (request, reply) => {
        // handler logic
      },
    );
  };
  ```

## 4. Asynchronous Code & Error Handling

- Always use `async`/`await` instead of raw Promise chains.
- Never use unhandled promises or empty catch blocks.
- Throw appropriate `AppError` subclasses instead of generic JavaScript `Error`.
- Log contextual information using Fastify's structured logger (`request.log.error(...)` or `fastify.log.info(...)`).
