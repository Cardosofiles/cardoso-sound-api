import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID_REGEX = /^[A-Za-z0-9._-]+$/;

export function resolveRequestId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return randomUUID().slice(0, 8);
  }

  if (!VALID_REQUEST_ID_REGEX.test(raw)) {
    return randomUUID().slice(0, 8);
  }

  return raw.slice(0, 64);
}
