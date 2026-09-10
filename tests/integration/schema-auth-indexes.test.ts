import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { account, session, user } from '../../src/db/schema/index.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Schema Auth Indexes & Constraints (T14–T17)', () => {
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

  // T14: pg_indexes contém session_user_id_idx, account_user_id_idx, verification_identifier_idx
  it('T14: pg_indexes contains session_user_id_idx, account_user_id_idx, and verification_identifier_idx', async () => {
    const result = await ctx.pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('session', 'account', 'verification')
    `);

    const indexNames = result.rows.map((r) => r.indexname);
    expect(indexNames).toContain('session_user_id_idx');
    expect(indexNames).toContain('account_user_id_idx');
    expect(indexNames).toContain('verification_identifier_idx');
  });

  // T15: pg_indexes contém account_provider_account_unique e ele é UNIQUE
  it('T15: pg_indexes contains account_provider_account_unique and index is unique', async () => {
    const result = await ctx.pool.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'account' AND indexname = 'account_provider_account_unique'
    `);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    assertDefined(row);
    expect(row.indexdef).toMatch(/CREATE UNIQUE INDEX/i);
    expect(row.indexdef).toContain('provider_id');
    expect(row.indexdef).toContain('account_id');
  });

  // T16: Inserir duas linhas em account com o mesmo (provider_id, account_id) -> erro 23505
  it('T16: rejects inserting two account rows with identical (provider_id, account_id) (error 23505 - GAP-16)', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'usr_t16_1',
        name: 'User T16',
        email: 't16@example.com',
      })
      .returning();
    assertDefined(testUser);

    await ctx.db.insert(account).values({
      id: 'acc_t16_1',
      accountId: 'oauth_user_123',
      providerId: 'google',
      userId: testUser.id,
    });

    let errorCaught: (Error & { code?: string; cause?: { code?: string } }) | null = null;
    try {
      await ctx.db.insert(account).values({
        id: 'acc_t16_2',
        accountId: 'oauth_user_123',
        providerId: 'google',
        userId: testUser.id,
      });
    } catch (err) {
      errorCaught = err as Error & { code?: string; cause?: { code?: string } };
    }

    expect(errorCaught).not.toBeNull();
    const pgCode = errorCaught?.code ?? errorCaught?.cause?.code;
    expect(pgCode).toBe('23505');
  });

  // T17: DELETE FROM "user" em cascata com sessão e account -> sem órfão, sem erro
  it('T17: deleting a user cascades to session and account without orphans or errors', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'usr_t17',
        name: 'User T17',
        email: 't17@example.com',
      })
      .returning();
    assertDefined(testUser);

    await ctx.db.insert(session).values({
      id: 'sess_t17',
      token: 'tok_t17',
      expiresAt: new Date(Date.now() + 3600_000),
      userId: testUser.id,
    });

    await ctx.db.insert(account).values({
      id: 'acc_t17',
      accountId: 'oauth_t17',
      providerId: 'github',
      userId: testUser.id,
    });

    await ctx.db.delete(user).where(eq(user.id, testUser.id));

    const remainingSessions = await ctx.db
      .select()
      .from(session)
      .where(eq(session.userId, testUser.id));
    const remainingAccounts = await ctx.db
      .select()
      .from(account)
      .where(eq(account.userId, testUser.id));

    expect(remainingSessions).toHaveLength(0);
    expect(remainingAccounts).toHaveLength(0);
  });
});
