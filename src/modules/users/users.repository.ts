import { eq } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { user } from '../../db/schema/index.js';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
}

export class UsersRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Localiza um usuário pelo identificador primário.
   * Projeção explícita de colunas seguras (Tier 1 de defesa contra vazamento de credenciais).
   */
  async findById(userId: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Atualiza dados de perfil do usuário.
   * Trata estritamente a semântica de image: null (limpar) vs image: undefined (não alterar).
   */
  async update(
    userId: string,
    data: { name?: string; image?: string | null },
  ): Promise<UserRow | null> {
    const setValues: {
      name?: string;
      image?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      setValues.name = data.name;
    }

    if (data.image !== undefined) {
      setValues.image = data.image;
    }

    const [updatedRow] = await this.db
      .update(user)
      .set(setValues)
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      });

    return updatedRow ?? null;
  }

  /**
   * Remove atomicamente o usuário dentro de uma transação.
   * As constraints de chave estrangeira com onDelete: 'cascade' garantem o expurgo
   * coordenado de sessões, contas e dados associados no PostgreSQL.
   */
  async delete(userId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const result = await tx.delete(user).where(eq(user.id, userId)).returning({ id: user.id });

      return result.length > 0;
    });
  }
}
