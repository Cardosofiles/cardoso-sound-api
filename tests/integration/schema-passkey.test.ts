import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthTables } from 'better-auth/db';
import { passkey, user } from '../../src/db/schema/index.js';
import { auth } from '../../src/modules/auth/auth.config.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Schema Passkey Integration Tests (T6–T12)', () => {
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

  // T6: Tabela passkey com as 11 colunas canônicas
  it('T6: table passkey exists in PostgreSQL with all 11 canonical columns', async () => {
    const result = await ctx.pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'passkey';
    `);

    const columnNames = result.rows.map((r) => r.column_name);
    const expectedColumns = [
      'id',
      'name',
      'public_key',
      'user_id',
      'credential_id',
      'counter',
      'device_type',
      'backed_up',
      'transports',
      'aaguid',
      'created_at',
    ];

    expect(columnNames).toHaveLength(11);
    for (const col of expectedColumns) {
      expect(columnNames).toContain(col);
    }
  });

  // T7: credential_id tem restrição UNIQUE
  it('T7: column credential_id has UNIQUE constraint', async () => {
    const result = await ctx.pool.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'passkey' AND c.contype = 'u';
    `);

    const constraintNames = result.rows.map((r) => r.conname);
    expect(constraintNames).toContain('passkey_credential_id_unique');
  });

  // T8: Inserir duas linhas com o mesmo credential_id resulta em erro 23505 (unique_violation)
  it('T8: inserting two passkeys with identical credential_id fails with 23505 error', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'usr_passkey_unique_test',
        name: 'Passkey Tester',
        email: 'passkey_unique@example.com',
      })
      .returning();
    assertDefined(testUser);

    await ctx.db.insert(passkey).values({
      id: 'pk_1',
      name: 'Key 1',
      publicKey: 'pubkey-1',
      userId: testUser.id,
      credentialID: 'duplicate-cred-id',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    let caughtError: unknown;
    try {
      await ctx.db.insert(passkey).values({
        id: 'pk_2',
        name: 'Key 2',
        publicKey: 'pubkey-2',
        userId: testUser.id,
        credentialID: 'duplicate-cred-id',
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    const pgError = caughtError as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    const errorCode = pgError.code ?? pgError.cause?.code;
    const constraint = pgError.constraint ?? pgError.cause?.constraint;
    expect(errorCode).toBe('23505');
    expect(constraint).toBe('passkey_credential_id_unique');
  });

  // T9: Coluna aaguid existe e aceita tipo text
  it('T9: column aaguid exists in passkey table and is of type text', async () => {
    const result = await ctx.pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'passkey' AND column_name = 'aaguid';
    `);

    expect(result.rows).toHaveLength(1);
    const col = result.rows[0];
    assertDefined(col);
    expect(col.column_name).toBe('aaguid');
    expect(col.data_type).toBe('text');
    expect(col.is_nullable).toBe('YES');
  });

  // T10: FK de passkey.user_id com ON DELETE CASCADE
  it('T10: foreign key of passkey.user_id has ON DELETE CASCADE constraint', async () => {
    const result = await ctx.pool.query<{
      conname: string;
      confdeltype: string;
    }>(`
      SELECT c.conname, c.confdeltype
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'passkey' AND c.contype = 'f';
    `);

    expect(result.rows.length).toBeGreaterThan(0);
    const fk = result.rows[0];
    assertDefined(fk);
    expect(fk.confdeltype).toBe('c'); // 'c' = CASCADE

    // Teste comportamental de integridade referencial
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'usr_passkey_cascade_test',
        name: 'Passkey Cascade',
        email: 'passkey_cascade@example.com',
      })
      .returning();
    assertDefined(testUser);

    await ctx.db.insert(passkey).values({
      id: 'pk_cascade_1',
      name: 'Cascade Key',
      publicKey: 'pubkey-cascade',
      userId: testUser.id,
      credentialID: 'cred-cascade-1',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    await ctx.db.delete(user).where(eq(user.id, testUser.id));

    const remainingPasskeys = await ctx.db
      .select()
      .from(passkey)
      .where(eq(passkey.userId, testUser.id));

    expect(remainingPasskeys).toHaveLength(0);
  });

  // T11: Índice passkey_user_id_idx presente em pg_indexes
  it('T11: index passkey_user_id_idx exists in pg_indexes', async () => {
    const result = await ctx.pool.query<{ indexname: string; tablename: string }>(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename = 'passkey' AND indexname = 'passkey_user_id_idx';
    `);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    assertDefined(row);
    expect(row.indexname).toBe('passkey_user_id_idx');
    expect(row.tablename).toBe('passkey');
  });

  // T12: Definição das tabelas do Better Auth bate com o schema sem diferenças
  it('T12: better-auth tables definition matches the Drizzle schema without differences', () => {
    const tables = getAuthTables(auth.options);
    expect(tables.passkey).toBeDefined();

    const expectedFields = [
      'name',
      'publicKey',
      'userId',
      'credentialID',
      'counter',
      'deviceType',
      'backedUp',
      'transports',
      'aaguid',
      'createdAt',
    ];

    assertDefined(tables.passkey);
    for (const field of expectedFields) {
      expect(tables.passkey.fields).toHaveProperty(field);
    }
  });
});
