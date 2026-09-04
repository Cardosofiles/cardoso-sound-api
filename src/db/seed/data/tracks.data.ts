import type { Genre } from '../../../config/constants.js';

export interface SeedTrack {
  artistName: string;
  title: string;
  album: string;
  genre: Genre;
  durationSeconds: number;
  coverUrl: string;
  audioUrl: string;
}

export const SEED_TRACKS: readonly SeedTrack[] = [
  // 1. Aurora Avenue (5 faixas: 5 Rock)
  {
    artistName: 'Aurora Avenue',
    title: 'Midnight Overdrive',
    album: 'Starlight Reverie',
    genre: 'rock',
    durationSeconds: 215,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    artistName: 'Aurora Avenue',
    title: 'Shadows in the Mist',
    album: 'Starlight Reverie',
    genre: 'rock',
    durationSeconds: 198,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    artistName: 'Aurora Avenue',
    title: 'Electric Pulse',
    album: 'Starlight Reverie',
    genre: 'rock',
    durationSeconds: 245,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    artistName: 'Aurora Avenue',
    title: 'Broken Reflections',
    album: 'Glass Horizon',
    genre: 'rock',
    durationSeconds: 180,
    coverUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    artistName: 'Aurora Avenue',
    title: 'Desert Road',
    album: 'Glass Horizon',
    genre: 'rock',
    durationSeconds: 260,
    coverUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },

  // 2. Lunar Echoes (5 faixas: 3 Rock, 2 Electronic)
  {
    artistName: 'Lunar Echoes',
    title: 'Gravity Well',
    album: 'Celestial Resonance',
    genre: 'rock',
    durationSeconds: 320,
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    artistName: 'Lunar Echoes',
    title: 'Orbit Decay',
    album: 'Celestial Resonance',
    genre: 'rock',
    durationSeconds: 295,
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    artistName: 'Lunar Echoes',
    title: 'Solar Flare',
    album: 'Celestial Resonance',
    genre: 'rock',
    durationSeconds: 230,
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  {
    artistName: 'Lunar Echoes',
    title: 'Static Silence',
    album: 'Vacuum Chamber',
    genre: 'electronic',
    durationSeconds: 210,
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },
  {
    artistName: 'Lunar Echoes',
    title: 'Cosmic Tide',
    album: 'Vacuum Chamber',
    genre: 'electronic',
    durationSeconds: 275,
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  },

  // 3. Velvet Horizon (5 faixas: 5 Pop)
  {
    artistName: 'Velvet Horizon',
    title: 'Golden Hour',
    album: 'Pastel Skies',
    genre: 'pop',
    durationSeconds: 195,
    coverUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  },
  {
    artistName: 'Velvet Horizon',
    title: 'Whispering Breeze',
    album: 'Pastel Skies',
    genre: 'pop',
    durationSeconds: 210,
    coverUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  },
  {
    artistName: 'Velvet Horizon',
    title: 'Summer Nostalgia',
    album: 'Pastel Skies',
    genre: 'pop',
    durationSeconds: 185,
    coverUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  },
  {
    artistName: 'Velvet Horizon',
    title: 'City Lights Fade',
    album: 'Neon Memories',
    genre: 'pop',
    durationSeconds: 220,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  },
  {
    artistName: 'Velvet Horizon',
    title: 'Afterglow',
    album: 'Neon Memories',
    genre: 'pop',
    durationSeconds: 205,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  },

  // 4. The Solar Waves (5 faixas: 3 Electronic, 2 Pop)
  {
    artistName: 'The Solar Waves',
    title: 'Synthesized Dreams',
    album: 'Digital Dawn',
    genre: 'electronic',
    durationSeconds: 240,
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3',
  },
  {
    artistName: 'The Solar Waves',
    title: 'Laser Grid',
    album: 'Digital Dawn',
    genre: 'electronic',
    durationSeconds: 190,
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    artistName: 'The Solar Waves',
    title: 'Retrofutura',
    album: 'Digital Dawn',
    genre: 'electronic',
    durationSeconds: 255,
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    artistName: 'The Solar Waves',
    title: 'Analog Hearts',
    album: 'Silicon Sunset',
    genre: 'pop',
    durationSeconds: 198,
    coverUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    artistName: 'The Solar Waves',
    title: 'Virtual Velocity',
    album: 'Silicon Sunset',
    genre: 'pop',
    durationSeconds: 212,
    coverUrl:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },

  // 5. Neon Mirage (5 faixas: 2 Electronic, 3 Lo-Fi)
  {
    artistName: 'Neon Mirage',
    title: 'Midnight Circuit',
    album: 'Cyber Odyssey',
    genre: 'electronic',
    durationSeconds: 265,
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    artistName: 'Neon Mirage',
    title: 'Chroma Shift',
    album: 'Cyber Odyssey',
    genre: 'electronic',
    durationSeconds: 230,
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    artistName: 'Neon Mirage',
    title: 'Underground Signal',
    album: 'Sublevel Zero',
    genre: 'lo-fi',
    durationSeconds: 165,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    artistName: 'Neon Mirage',
    title: 'Neon Rain',
    album: 'Sublevel Zero',
    genre: 'lo-fi',
    durationSeconds: 155,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  {
    artistName: 'Neon Mirage',
    title: 'Dark Alley Resonance',
    album: 'Sublevel Zero',
    genre: 'lo-fi',
    durationSeconds: 180,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },

  // 6. Dusty Grooves (5 faixas: 3 Lo-Fi, 2 Hip-Hop)
  {
    artistName: 'Dusty Grooves',
    title: 'Morning Brew',
    album: 'Coffee & Vinyl',
    genre: 'lo-fi',
    durationSeconds: 140,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  },
  {
    artistName: 'Dusty Grooves',
    title: 'Rainy Window',
    album: 'Coffee & Vinyl',
    genre: 'lo-fi',
    durationSeconds: 150,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  },
  {
    artistName: 'Dusty Grooves',
    title: 'Sunday Afternoon',
    album: 'Coffee & Vinyl',
    genre: 'lo-fi',
    durationSeconds: 160,
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  },
  {
    artistName: 'Dusty Grooves',
    title: 'Late Night Study',
    album: 'Tape Cassette Memories',
    genre: 'hip-hop',
    durationSeconds: 175,
    coverUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  },
  {
    artistName: 'Dusty Grooves',
    title: 'Faded Polaroids',
    album: 'Tape Cassette Memories',
    genre: 'hip-hop',
    durationSeconds: 190,
    coverUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  },

  // 7. Echoes of Orion (5 faixas: 4 Hip-Hop, 1 Jazz)
  {
    artistName: 'Echoes of Orion',
    title: 'Street Philosophy',
    album: 'Concrete Metaphor',
    genre: 'hip-hop',
    durationSeconds: 205,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  },
  {
    artistName: 'Echoes of Orion',
    title: 'Boom Bap Renaissance',
    album: 'Concrete Metaphor',
    genre: 'hip-hop',
    durationSeconds: 215,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3',
  },
  {
    artistName: 'Echoes of Orion',
    title: 'Rhyme Scheme',
    album: 'Concrete Metaphor',
    genre: 'hip-hop',
    durationSeconds: 195,
    coverUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    artistName: 'Echoes of Orion',
    title: 'Cipher in the Dark',
    album: 'Midnight Cipher',
    genre: 'hip-hop',
    durationSeconds: 225,
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    artistName: 'Echoes of Orion',
    title: 'Urban Tapestry',
    album: 'Midnight Cipher',
    genre: 'jazz',
    durationSeconds: 250,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },

  // 8. Quantum Drift (5 faixas: 5 Jazz)
  {
    artistName: 'Quantum Drift',
    title: 'Synchronous Swing',
    album: 'Blue Note Continuum',
    genre: 'jazz',
    durationSeconds: 310,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    artistName: 'Quantum Drift',
    title: 'Modal Horizons',
    album: 'Blue Note Continuum',
    genre: 'jazz',
    durationSeconds: 345,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    artistName: 'Quantum Drift',
    title: 'Midnight in Montreux',
    album: 'Blue Note Continuum',
    genre: 'jazz',
    durationSeconds: 290,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    artistName: 'Quantum Drift',
    title: 'Chromatic Velocity',
    album: 'Fusion Dynamics',
    genre: 'jazz',
    durationSeconds: 270,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    artistName: 'Quantum Drift',
    title: 'Velvet Saxophone',
    album: 'Fusion Dynamics',
    genre: 'jazz',
    durationSeconds: 325,
    coverUrl:
      'https://images.unsplash.com/photo-1520523839898-507127047781?w=500&auto=format&fit=crop',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
] as const;
