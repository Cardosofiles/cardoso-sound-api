import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, toOffset } from '../../../src/shared/utils/pagination.js';

describe('pagination utils', () => {
  describe('toOffset', () => {
    it('T1: calculates offset for first page', () => {
      const offset = toOffset({ page: 1, limit: 20 });
      expect(offset).toBe(0);
    });

    it('T2: calculates offset for subsequent pages', () => {
      const offset = toOffset({ page: 3, limit: 20 });
      expect(offset).toBe(40);
    });
  });

  describe('buildPaginationMeta', () => {
    it('T3: builds metadata for first page when more pages exist', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20, total: 40 });
      expect(meta).toEqual({
        page: 1,
        limit: 20,
        total: 40,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('T4: builds metadata for last page', () => {
      const meta = buildPaginationMeta({ page: 2, limit: 20, total: 40 });
      expect(meta.totalPages).toBe(2);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(true);
    });

    it('T5: handles total 0 with totalPages 1 and no next/prev', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20, total: 0 });
      expect(meta.totalPages).toBe(1);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(false);
    });

    it('T6: rounds up totalPages for remainder items', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20, total: 41 });
      expect(meta.totalPages).toBe(3);
    });
  });
});
