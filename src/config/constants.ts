import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../shared/utils/pagination.js';

export const APP_NAME = 'cardoso-sound-api';
export const API_PREFIX = '/api/v1';
export const AUTH_PREFIX = '/api/auth';

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

export const MAX_PLAYLISTS_PER_USER = 50;
export const MAX_TRACKS_PER_PLAYLIST = 500;

export const GENRES = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
export type Genre = (typeof GENRES)[number];

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 8;
export const SHUTDOWN_TIMEOUT_MS = 10_000;
