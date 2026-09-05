import { NotFoundError } from '../../shared/errors/index.js';
import { UsersRepository } from './users.repository.js';
import type { MeDto, UpdateMeInput } from './users.schema.js';

export class UsersService {
  constructor(private readonly repo: UsersRepository = new UsersRepository()) {}

  async getMe(userId: string): Promise<MeDto> {
    const row = await this.repo.findById(userId);

    if (!row) {
      throw new NotFoundError('User not found');
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<MeDto> {
    const updated = await this.repo.update(userId, input);

    if (!updated) {
      throw new NotFoundError('User not found');
    }

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      image: updated.image,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async deleteMe(userId: string): Promise<void> {
    const deleted = await this.repo.delete(userId);

    if (!deleted) {
      throw new NotFoundError('User not found');
    }
  }
}
