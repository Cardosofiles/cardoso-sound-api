export interface SeedArtist {
  name: string;
  bio: string;
  avatarUrl: string;
}

export const SEED_ARTISTS: readonly SeedArtist[] = [
  {
    name: 'Aurora Avenue',
    bio: 'Alt-rock five-piece delivering punchy guitar riffs, driving rhythms, and introspective lyricism.',
    avatarUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
  },
  {
    name: 'Lunar Echoes',
    bio: 'Post-rock and ambient collective crafting atmospheric guitar textures and cinematic soundscapes.',
    avatarUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop',
  },
  {
    name: 'Velvet Horizon',
    bio: 'Indie pop outfit blending acoustic warmth with lush vocal harmonies and dreamy synthesizer melodies.',
    avatarUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
  },
  {
    name: 'The Solar Waves',
    bio: 'Electronic synthpop duo from Berlin blending analog synth nostalgia with modern electro beats.',
    avatarUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop',
  },
  {
    name: 'Neon Mirage',
    bio: 'Cyberpunk and dark synthwave producer crafting driving basslines, gritty distortion, and nocturnal moods.',
    avatarUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop',
  },
  {
    name: 'Dusty Grooves',
    bio: 'Lo-fi hip-hop beatmaker combining vintage vinyl crackles with soothing jazz-infused piano loops.',
    avatarUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
  },
  {
    name: 'Echoes of Orion',
    bio: 'Boom-bap and conscious hip-hop lyricist pairing intricate wordplay with soulful vintage samples.',
    avatarUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
  },
  {
    name: 'Quantum Drift',
    bio: 'Instrumental jazz fusion ensemble exploring progressive polyrhythms and intricate modal improvisations.',
    avatarUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
  },
] as const;
