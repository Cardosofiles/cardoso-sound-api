import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { playlists } from './playlists.schema.js';
import { tracks } from './tracks.schema.js';

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playlistId, table.trackId] })],
);

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type NewPlaylistTrack = typeof playlistTracks.$inferInsert;
