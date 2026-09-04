import { count } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { db, pool, type Database } from '../client.js';
import { artists, tracks } from '../schema/index.js';
import { SEED_ARTISTS } from './data/artists.data.js';
import { SEED_TRACKS } from './data/tracks.data.js';

export async function seed(database: Database): Promise<{
  artistsInserted: number;
  tracksInserted: number;
  artistsTotal: number;
  tracksTotal: number;
}> {
  return database.transaction(async (tx) => {
    const insertedArtists = await tx
      .insert(artists)
      .values([...SEED_ARTISTS])
      .onConflictDoNothing({ target: artists.name })
      .returning({ id: artists.id, name: artists.name });

    // Relê todos os artistas cadastrados para garantir o mapa de IDs mesmo em re-execuções
    const allArtists = await tx.select({ id: artists.id, name: artists.name }).from(artists);
    const idByName = new Map(allArtists.map((a) => [a.name, a.id]));

    const trackRows = SEED_TRACKS.map((t) => {
      const artistId = idByName.get(t.artistName);
      if (!artistId) {
        throw new Error(`Seed track "${t.title}" references unknown artist: "${t.artistName}"`);
      }

      return {
        title: t.title,
        artistId,
        album: t.album,
        genre: t.genre,
        durationSeconds: t.durationSeconds,
        coverUrl: t.coverUrl,
        audioUrl: t.audioUrl,
      };
    });

    const insertedTracks = await tx
      .insert(tracks)
      .values(trackRows)
      .onConflictDoNothing({ target: [tracks.artistId, tracks.title] })
      .returning({ id: tracks.id });

    const [artistsCountRes] = await tx.select({ value: count() }).from(artists);
    const [tracksCountRes] = await tx.select({ value: count() }).from(tracks);

    return {
      artistsInserted: insertedArtists.length,
      tracksInserted: insertedTracks.length,
      artistsTotal: artistsCountRes?.value ?? 0,
      tracksTotal: tracksCountRes?.value ?? 0,
    };
  });
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  (fileURLToPath(import.meta.url) === process.argv[1] || process.argv[1]?.endsWith('seed.ts'));

if (isDirectExecution) {
  void (async () => {
    try {
      process.stdout.write('[Database Seed] Starting catalog seed...\n');
      const result = await seed(db);
      process.stdout.write(
        `[Database Seed] Completed successfully: ` +
          `Artists: ${String(result.artistsInserted)} inserted (${String(result.artistsTotal)} total), ` +
          `Tracks: ${String(result.tracksInserted)} inserted (${String(result.tracksTotal)} total).\n`,
      );
      await pool.end();
      process.exit(0);
    } catch (error: unknown) {
      process.stderr.write(`[Database Seed Error] Failed: ${String(error)}\n`);
      await pool.end();
      process.exit(1);
    }
  })();
}
