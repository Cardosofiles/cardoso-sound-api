export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function toOffset(input: { page: number; limit: number }): number {
  return (input.page - 1) * input.limit;
}

export function buildPaginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(input.total / input.limit));
  const hasNext = input.page < totalPages;
  const hasPrev = input.page > 1;

  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages,
    hasNext,
    hasPrev,
  };
}
