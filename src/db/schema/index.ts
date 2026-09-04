import { relations } from 'drizzle-orm';
import { artists } from './artists.schema.js';
import { favorites } from './favorites.schema.js';
import { playlistTracks } from './playlist-tracks.schema.js';
import { playlists } from './playlists.schema.js';
import { tracks } from './tracks.schema.js';
import { user } from './users.schema.js';

// Reexportação das 9 tabelas e tipos
export * from './artists.schema.js';
export * from './favorites.schema.js';
export * from './playlist-tracks.schema.js';
export * from './playlists.schema.js';
export * from './tracks.schema.js';
export * from './users.schema.js';

// Relações do Drizzle ORM (Spec 02 §6)
export const artistsRelations = relations(artists, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  artist: one(artists, {
    fields: [tracks.artistId],
    references: [artists.id],
  }),
  playlistTracks: many(playlistTracks),
  favorites: many(favorites),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(user, {
    fields: [playlists.userId],
    references: [user.id],
  }),
  playlistTracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(user, {
    fields: [favorites.userId],
    references: [user.id],
  }),
  track: one(tracks, {
    fields: [favorites.trackId],
    references: [tracks.id],
  }),
}));
