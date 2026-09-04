import { index, integer, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { artists } from './artists.schema.js';

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    album: varchar('album', { length: 255 }),
    genre: varchar('genre', { length: 40 }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    coverUrl: varchar('cover_url', { length: 500 }),
    audioUrl: varchar('audio_url', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('tracks_artist_title_unique').on(table.artistId, table.title),
    index('tracks_artist_id_idx').on(table.artistId),
    index('tracks_genre_idx').on(table.genre),
  ],
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
