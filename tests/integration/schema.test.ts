import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  artists,
  favorites,
  playlists,
  playlistTracks,
  tracks,
  user,
} from '../../src/db/schema/index.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Schema & Constraints Integration Tests', () => {
  let ctx: TestDatabase;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  // T1: Inserir 2 artistas com o mesmo name -> violação de unique
  it('T1: rejects inserting two artists with the same name (unique constraint)', async () => {
    await ctx.db.insert(artists).values({
      name: 'Duplicate Artist',
      bio: 'First artist bio',
    });

    await expect(
      ctx.db.insert(artists).values({
        name: 'Duplicate Artist',
        bio: 'Second artist bio',
      }),
    ).rejects.toThrow();
  });

  // T2: 2 faixas com mesmo (artist_id, title) -> violação de unique
  it('T2: rejects inserting two tracks with the same artistId and title (unique constraint)', async () => {
    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T2' }).returning();
    assertDefined(artist);

    await ctx.db.insert(tracks).values({
      title: 'Same Title',
      artistId: artist.id,
      genre: 'rock',
      durationSeconds: 180,
      audioUrl: 'https://example.com/audio1.mp3',
    });

    await expect(
      ctx.db.insert(tracks).values({
        title: 'Same Title',
        artistId: artist.id,
        genre: 'pop',
        durationSeconds: 200,
        audioUrl: 'https://example.com/audio2.mp3',
      }),
    ).rejects.toThrow();
  });

  // T3: 2 faixas com mesmo título e artistas diferentes -> ok
  it('T3: allows two tracks with the same title under different artists', async () => {
    const [artist1] = await ctx.db.insert(artists).values({ name: 'Artist T3-1' }).returning();
    const [artist2] = await ctx.db.insert(artists).values({ name: 'Artist T3-2' }).returning();
    assertDefined(artist1);
    assertDefined(artist2);

    const [track1] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Common Title',
        artistId: artist1.id,
        genre: 'rock',
        durationSeconds: 180,
        audioUrl: 'https://example.com/audio1.mp3',
      })
      .returning();

    const [track2] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Common Title',
        artistId: artist2.id,
        genre: 'electronic',
        durationSeconds: 210,
        audioUrl: 'https://example.com/audio2.mp3',
      })
      .returning();

    assertDefined(track1);
    assertDefined(track2);
    expect(track1.id).toBeDefined();
    expect(track2.id).toBeDefined();
    expect(track1.id).not.toBe(track2.id);
  });

  // T4: Apagar artista -> faixas dele somem (cascade)
  it('T4: deleting an artist cascades and deletes associated tracks', async () => {
    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T4' }).returning();
    assertDefined(artist);

    await ctx.db.insert(tracks).values({
      title: 'Track To Cascade',
      artistId: artist.id,
      genre: 'rock',
      durationSeconds: 190,
      audioUrl: 'https://example.com/audio.mp3',
    });

    await ctx.db.delete(artists).where(eq(artists.id, artist.id));

    const remainingTracks = await ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.artistId, artist.id));

    expect(remainingTracks).toHaveLength(0);
  });

  // T5: Apagar "user" -> playlists e favorites dele somem (cascade)
  it('T5: deleting a user cascades and deletes their playlists and favorites', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'user-t5-id',
        name: 'User T5',
        email: 'user-t5@example.com',
      })
      .returning();
    assertDefined(testUser);

    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T5' }).returning();
    assertDefined(artist);

    const [track] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Track T5',
        artistId: artist.id,
        genre: 'pop',
        durationSeconds: 180,
        audioUrl: 'https://example.com/audio.mp3',
      })
      .returning();
    assertDefined(track);

    await ctx.db.insert(playlists).values({
      userId: testUser.id,
      name: 'User Playlist T5',
    });

    await ctx.db.insert(favorites).values({
      userId: testUser.id,
      trackId: track.id,
    });

    await ctx.db.delete(user).where(eq(user.id, testUser.id));

    const remainingPlaylists = await ctx.db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, testUser.id));
    const remainingFavorites = await ctx.db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, testUser.id));

    expect(remainingPlaylists).toHaveLength(0);
    expect(remainingFavorites).toHaveLength(0);
  });

  // T6: Apagar playlist -> linhas de playlist_tracks somem (cascade)
  it('T6: deleting a playlist cascades and deletes associated playlist_tracks', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'user-t6-id',
        name: 'User T6',
        email: 'user-t6@example.com',
      })
      .returning();
    assertDefined(testUser);

    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T6' }).returning();
    assertDefined(artist);

    const [track] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Track T6',
        artistId: artist.id,
        genre: 'jazz',
        durationSeconds: 220,
        audioUrl: 'https://example.com/audio.mp3',
      })
      .returning();
    assertDefined(track);

    const [playlist] = await ctx.db
      .insert(playlists)
      .values({
        userId: testUser.id,
        name: 'Playlist T6',
      })
      .returning();
    assertDefined(playlist);

    await ctx.db.insert(playlistTracks).values({
      playlistId: playlist.id,
      trackId: track.id,
    });

    await ctx.db.delete(playlists).where(eq(playlists.id, playlist.id));

    const remainingPlaylistTracks = await ctx.db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlist.id));

    expect(remainingPlaylistTracks).toHaveLength(0);
  });

  // T7: Duplicar (playlist_id, track_id) -> violação de PK composta
  it('T7: rejects duplicate (playlist_id, track_id) entries in playlist_tracks', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'user-t7-id',
        name: 'User T7',
        email: 'user-t7@example.com',
      })
      .returning();
    assertDefined(testUser);

    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T7' }).returning();
    assertDefined(artist);

    const [track] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Track T7',
        artistId: artist.id,
        genre: 'lo-fi',
        durationSeconds: 150,
        audioUrl: 'https://example.com/audio.mp3',
      })
      .returning();
    assertDefined(track);

    const [playlist] = await ctx.db
      .insert(playlists)
      .values({
        userId: testUser.id,
        name: 'Playlist T7',
      })
      .returning();
    assertDefined(playlist);

    await ctx.db.insert(playlistTracks).values({
      playlistId: playlist.id,
      trackId: track.id,
    });

    await expect(
      ctx.db.insert(playlistTracks).values({
        playlistId: playlist.id,
        trackId: track.id,
      }),
    ).rejects.toThrow();
  });

  // T8: Duplicar (user_id, track_id) em favorites -> violação de PK composta
  it('T8: rejects duplicate (user_id, track_id) entries in favorites', async () => {
    const [testUser] = await ctx.db
      .insert(user)
      .values({
        id: 'user-t8-id',
        name: 'User T8',
        email: 'user-t8@example.com',
      })
      .returning();
    assertDefined(testUser);

    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T8' }).returning();
    assertDefined(artist);

    const [track] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Track T8',
        artistId: artist.id,
        genre: 'hip-hop',
        durationSeconds: 210,
        audioUrl: 'https://example.com/audio.mp3',
      })
      .returning();
    assertDefined(track);

    await ctx.db.insert(favorites).values({
      userId: testUser.id,
      trackId: track.id,
    });

    await expect(
      ctx.db.insert(favorites).values({
        userId: testUser.id,
        trackId: track.id,
      }),
    ).rejects.toThrow();
  });

  // T9: track.genre NOT NULL -> insert sem genre falha
  it('T9: rejects inserting a track with null genre (NOT NULL constraint)', async () => {
    const [artist] = await ctx.db.insert(artists).values({ name: 'Artist T9' }).returning();
    assertDefined(artist);

    await expect(
      ctx.db.insert(tracks).values({
        title: 'Track Without Genre',
        artistId: artist.id,
        genre: null as unknown as string,
        durationSeconds: 200,
        audioUrl: 'https://example.com/audio.mp3',
      }),
    ).rejects.toThrow();
  });

  // T10: db.query.tracks.findMany({ with: { artist: true } }) -> devolve o artista aninhado
  it('T10: returns nested artist using relational query db.query.tracks.findMany with artist: true', async () => {
    const [artist] = await ctx.db
      .insert(artists)
      .values({
        name: 'Artist T10',
        bio: 'Relational query artist bio',
      })
      .returning();
    assertDefined(artist);

    const [track] = await ctx.db
      .insert(tracks)
      .values({
        title: 'Track T10',
        artistId: artist.id,
        genre: 'rock',
        durationSeconds: 235,
        audioUrl: 'https://example.com/audio.mp3',
      })
      .returning();
    assertDefined(track);

    const foundTracks = await ctx.db.query.tracks.findMany({
      where: eq(tracks.id, track.id),
      with: {
        artist: true,
      },
    });

    expect(foundTracks).toHaveLength(1);
    const firstFound = foundTracks[0];
    assertDefined(firstFound);
    expect(firstFound.artist).toBeDefined();
    expect(firstFound.artist.id).toBe(artist.id);
    expect(firstFound.artist.name).toBe('Artist T10');
    expect(firstFound.artist.bio).toBe('Relational query artist bio');
  });
});
