import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRow, UsersRepository } from '../../../../src/modules/users/users.repository.js';
import { UsersService } from '../../../../src/modules/users/users.service.js';
import { NotFoundError } from '../../../../src/shared/errors/index.js';

function createMockRepository() {
  const findById = vi.fn();
  const update = vi.fn();
  const deleteUser = vi.fn();
  const repo = {
    findById,
    update,
    delete: deleteUser,
  } as unknown as UsersRepository;

  return { repo, findById, update, deleteUser };
}

function createSampleUserRow(overrides?: Partial<UserRow>): UserRow {
  return {
    id: 'usr_test_123',
    name: 'João Cardoso',
    email: 'joao@example.com',
    image: 'https://example.com/avatar.jpg',
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: getMe com linha válida -> DTO com as 5 chaves
  it('T1: getMe with valid user row returns DTO with exactly the 5 fields and ISO date', async () => {
    const { repo, findById } = createMockRepository();
    const sampleRow = createSampleUserRow();
    findById.mockResolvedValue(sampleRow);

    const service = new UsersService(repo);
    const result = await service.getMe('usr_test_123');

    expect(result).toEqual({
      id: 'usr_test_123',
      name: 'João Cardoso',
      email: 'joao@example.com',
      image: 'https://example.com/avatar.jpg',
      createdAt: '2026-09-05T12:00:00.000Z',
    });
    expect(findById).toHaveBeenCalledWith('usr_test_123');
  });

  // T2: getMe com null -> lança NotFoundError
  it('T2: getMe with null from repository throws NotFoundError', async () => {
    const { repo, findById } = createMockRepository();
    findById.mockResolvedValue(null);

    const service = new UsersService(repo);

    await expect(service.getMe('non-existent-id')).rejects.toThrow(NotFoundError);
    await expect(service.getMe('non-existent-id')).rejects.toThrow('User not found');
  });

  // T3: DTO não contém password nem emailVerified
  it('T3: getMe returns DTO that strictly does NOT contain password or emailVerified', async () => {
    const { repo, findById } = createMockRepository();
    // Simula objeto do banco com propriedades excedentes caso vazassem
    const sampleWithExtras = {
      ...createSampleUserRow(),
      password: 'hashed-secret-password',
      emailVerified: true,
      updatedAt: new Date(),
    } as unknown as UserRow;
    findById.mockResolvedValue(sampleWithExtras);

    const service = new UsersService(repo);
    const result = await service.getMe('usr_test_123');

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('emailVerified');
    expect(result).not.toHaveProperty('updatedAt');
    expect(Object.keys(result).sort()).toEqual(
      ['createdAt', 'email', 'id', 'image', 'name'].sort(),
    );
  });

  // T4: updateMe só com name -> repository recebe só name
  it('T4: updateMe with only name passes only name to repository', async () => {
    const { repo, update } = createMockRepository();
    const updatedRow = createSampleUserRow({ name: 'Nome Atualizado' });
    update.mockResolvedValue(updatedRow);

    const service = new UsersService(repo);
    const result = await service.updateMe('usr_test_123', { name: 'Nome Atualizado' });

    expect(update).toHaveBeenCalledWith('usr_test_123', { name: 'Nome Atualizado' });
    expect(result.name).toBe('Nome Atualizado');
  });

  // T5: updateMe com image: null -> repository recebe image: null (não undefined)
  it('T5: updateMe with image: null passes explicit image: null to repository', async () => {
    const { repo, update } = createMockRepository();
    const updatedRow = createSampleUserRow({ image: null });
    update.mockResolvedValue(updatedRow);

    const service = new UsersService(repo);
    const result = await service.updateMe('usr_test_123', { image: null });

    expect(update).toHaveBeenCalledWith('usr_test_123', { image: null });
    expect(result.image).toBeNull();
  });

  // T6: updateMe com null do repository -> lança NotFoundError
  it('T6: updateMe with null from repository throws NotFoundError', async () => {
    const { repo, update } = createMockRepository();
    update.mockResolvedValue(null);

    const service = new UsersService(repo);

    await expect(service.updateMe('non-existent-id', { name: 'Novo Nome' })).rejects.toThrow(
      NotFoundError,
    );
  });

  // T7: deleteMe com false -> lança NotFoundError
  it('T7: deleteMe with false from repository throws NotFoundError', async () => {
    const { repo, deleteUser } = createMockRepository();
    deleteUser.mockResolvedValue(false);

    const service = new UsersService(repo);

    await expect(service.deleteMe('non-existent-id')).rejects.toThrow(NotFoundError);
    expect(deleteUser).toHaveBeenCalledWith('non-existent-id');
  });

  // T8: deleteMe com true -> resolve sem valor (undefined)
  it('T8: deleteMe with true from repository resolves successfully with undefined', async () => {
    const { repo, deleteUser } = createMockRepository();
    deleteUser.mockResolvedValue(true);

    const service = new UsersService(repo);
    await service.deleteMe('usr_test_123');

    expect(deleteUser).toHaveBeenCalledWith('usr_test_123');
  });
});
