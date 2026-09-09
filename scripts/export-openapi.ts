import type { FastifyInstance } from 'fastify';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/client.js';

// Previne timers de background do underPressurePlugin
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

export function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

export async function generateOpenApiSpec(existingApp?: FastifyInstance): Promise<string> {
  const app = existingApp ?? (await buildApp());
  try {
    await app.ready();
    const rawSpec = app.swagger();
    const sortedSpec = sortObjectKeys(rawSpec);
    return JSON.stringify(sortedSpec, null, 2) + '\n';
  } finally {
    if (!existingApp) {
      await app.close();
    }
  }
}

async function main(): Promise<void> {
  try {
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
  } finally {
    if (!pool.ending) {
      await pool.end();
    }
  }
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  void main();
}
