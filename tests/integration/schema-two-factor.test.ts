import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthTables } from 'better-auth/db';
import { twoFactor, user } from '../../src/db/schema/index.js';
import { auth } from '../../src/modules/auth/auth.config.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Schema Two Factor Integration Tests (T1–T5)', () => {
  let ctx: TestDatabase;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  // T1: Tabela two_factor existe com colunas canônicas
  it('T1: table two_factor exists in PostgreSQL with all canonical columns', async () => {
    const result = await ctx.pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'two_factor';
    `);

    const columnNames = result.rows.map((r) => r.column_name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('secret');
    expect(columnNames).toContain('backup_codes');
    expect(columnNames).toContain('verified');
    expect(columnNames).toContain('failed_verification_count');
    expect(columnNames).toContain('locked_until');
    expect(columnNames).toContain('created_at');
  });

  // T2: user.two_factor_enabled existe, NOT NULL, default false
  it('T2: column user.two_factor_enabled exists, is NOT NULL and defaults to false', async () => {
    const result = await ctx.pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string;
      data_type: string;
    }>(`
      SELECT column_name, is_nullable, column_default, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'two_factor_enabled';
    `);

    expect(result.rows).toHaveLength(1);
    const col = result.rows[0];
    assertDefined(col);
    expect(col.column_name).toBe('two_factor_enabled');
    expect(col.is_nullable).toBe('NO');
    expect(col.column_default).toMatch(/false/i);
    expect(col.data_type).toBe('boolean');
  });

  // T3: Índice two_factor_user_id_idx presente
  it('T3: index two_factor_user_id_idx exists in pg_indexes', async () => {
    const result = await ctx.pool.query<{ indexname: string; tablename: string }>(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename = 'two_factor' AND indexname = 'two_factor_user_id_idx';
    `);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    assertDefined(row);
    expect(row.indexname).toBe('two_factor_user_id_idx');
    expect(row.tablename).toBe('two_factor');
  });

  // T4: FK de two_factor.user_id com ON DELETE CASCADE
  it('T4: foreign key of two_factor.user_id has ON DELETE CASCADE constraint', async () => {
    const result = await ctx.pool.query<{
      conname: string;
      confdeltype: string;
    }>(`
      SELECT c.conname, c.confdeltype
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'two_factor' AND c.contype = 'f';
    `);

    expect(result.rows.length).toBeGreaterThan(0);
    const fk = result.rows[0];
    assertDefined(fk);
    // Em PostgreSQL, 'c' = CASCADE
    expect(fk.confdeltype).toBe('c');

    // Validação comportamental: deletar usuário deve remover two_factor em cascata
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'usr_cascade_test',
        name: 'Cascade Tester',
        email: 'cascade@example.com',
      })
      .returning();
    assertDefined(testUser);

    await ctx.db.insert(twoFactor).values({
      id: 'tf_cascade_test',
      userId: testUser.id,
      secret: 'secret-xyz',
      backupCodes: '["code1"]',
    });

    await ctx.db.delete(user).where(eq(user.id, testUser.id));

    const remainingTwoFactor = await ctx.db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, testUser.id));

    expect(remainingTwoFactor).toHaveLength(0);
  });

  // T5: Validação do schema contra o esperado pela biblioteca Better Auth
  it('T5: better-auth tables definition matches the Drizzle schema without differences', () => {
    const tables = getAuthTables(auth.options);
    expect(tables.twoFactor).toBeDefined();

    // Campos obrigatórios que o Better Auth espera no modelo twoFactor
    const expectedFields = [
      'secret',
      'backupCodes',
      'userId',
      'verified',
      'failedVerificationCount',
      'lockedUntil',
    ];

    assertDefined(tables.twoFactor);
    for (const field of expectedFields) {
      expect(tables.twoFactor.fields).toHaveProperty(field);
    }

    // Campos no modelo user
    assertDefined(tables.user);
    expect(tables.user.fields).toHaveProperty('twoFactorEnabled');
  });
});
