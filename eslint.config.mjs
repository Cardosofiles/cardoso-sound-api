import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  // 1. Ignores globais
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'drizzle/**',
      'node_modules/**',
      '.husky/**',
      '*.config.ts',
      '*.config.mts',
      '*.config.mjs',
      '*.workspace.ts',
    ],
  },
  // 2. JavaScript recomendado
  js.configs.recommended,
  // 3. TypeScript strictTypeChecked para arquivos TypeScript
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  // 4. Configuração do parser e regras de TypeScript
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  // 5. Configuração de boundaries, console e process.env para código-fonte (src/**)
  {
    files: ['src/**/*.ts'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/elements': [
        { type: 'routes', pattern: 'src/modules/*/*.routes.ts', mode: 'full' },
        { type: 'service', pattern: 'src/modules/*/*.service.ts', mode: 'full' },
        { type: 'repository', pattern: 'src/modules/*/*.repository.ts', mode: 'full' },
        { type: 'dto', pattern: 'src/modules/*/*.schema.ts', mode: 'full' },
        {
          type: 'plugin',
          pattern: ['src/plugins/*.plugin.ts', 'src/modules/auth/*.plugin.ts'],
          mode: 'full',
        },
        { type: 'db', pattern: 'src/db/**', mode: 'full' },
        { type: 'shared', pattern: 'src/shared/**', mode: 'full' },
        {
          type: 'config',
          pattern: ['src/config/**', 'src/modules/auth/auth.config.ts'],
          mode: 'full',
        },
        { type: 'app', pattern: 'src/app.ts', mode: 'full' },
        { type: 'server', pattern: 'src/server.ts', mode: 'full' },
        { type: 'jobs', pattern: 'src/jobs/**', mode: 'full' },
      ],
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Use env from 'src/config/env.js' instead of accessing process.env directly.",
        },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: 'routes',
              allow: ['service', 'dto', 'shared', 'config'],
            },
            {
              from: 'service',
              allow: ['repository', 'dto', 'shared', 'config'],
            },
            {
              from: 'repository',
              allow: ['db', 'dto', 'shared', 'config'],
            },
            {
              from: 'dto',
              allow: ['shared'],
            },
            {
              from: 'plugin',
              allow: ['shared', 'config', 'dto', 'db'],
            },
            {
              from: 'db',
              allow: ['shared', 'config', 'db'],
            },
            {
              from: 'shared',
              allow: ['shared'],
            },
            {
              from: 'config',
              allow: ['shared'],
            },
            {
              from: 'app',
              allow: ['plugin', 'routes', 'shared', 'config'],
            },
            {
              from: 'server',
              allow: ['app', 'config', 'db', 'shared'],
            },
            {
              from: 'jobs',
              allow: ['db', 'shared', 'config'],
            },
          ],
        },
      ],
    },
  },
  // 6. Exceção para src/config/env.ts (autorizado a acessar process.env)
  {
    files: ['src/config/env.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // 7. Overrides para suíte de testes (tests/**)
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
