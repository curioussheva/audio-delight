// src/constants/equalizerPresets.ts
import { Preset, EqualizerBand, BandType } from "@/features/equalizer/types";

// 1. Definisikan Base Value
export const EQ_FREQUENCIES = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];

export const EQ_BAND_TYPES: BandType[] = [
  "lowshelf",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "highshelf",
];

export const DEFAULT_Q = 1.414;

// 2. Fungsi Helper untuk memastikan tipe data selalu konsisten
export const makeBands = (gains: number[]): EqualizerBand[] => {
  return EQ_FREQUENCIES.map((freq, i) => ({
    id: i,
    frequency: freq,
    gain: gains[i] ?? 0,
    q: DEFAULT_Q,
    type: EQ_BAND_TYPES[i],
  }));
};

// 3. Gabungkan semua Preset ke dalam SATU array
export const ALL_PRESETS: Preset[] = [
  {
    id: "flat",
    name: "Normal",
    description: "Output murni tanpa perubahan fasa.",
    isPremium: false,
    bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  // --- TAMBAHAN REQUESTED ---
  {
    id: "clarity",
    name: "Clarity",
    description: "Menjernihkan instrumen dan vokal yang teredam.",
    isPremium: false,
    bands: makeBands([-2, -1, 0, 0, 1, 2, 3, 4, 4, 3]),
  },
  {
    id: "night",
    name: "Night Mode",
    description: "Kurangi frekuensi tajam agar telinga tidak lelah.",
    isPremium: false,
    bands: makeBands([2, 2, 1, 0, 0, 0, -1, -3, -4, -5]),
  },
  {
    id: "loudness",
    name: "Loudness",
    description: "Kompensasi bass dan treble saat volume rendah.",
    isPremium: false,
    bands: makeBands([5, 3, 1, 0, 0, 0, 1, 2, 4, 5]),
  },
  // --- STANDAR FAMILIAR ---
  {
    id: "bass-boost",
    name: "Bass Boost",
    description: "Deep punchy bass.",
    isPremium: false,
    bands: makeBands([6, 5, 3, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: "rock",
    name: "Rock",
    description: "V-Shape klasik bertenaga.",
    isPremium: false,
    bands: makeBands([4, 3, 1, -1, -2, -1, 1, 2, 3, 4]),
  },
  {
    id: "pop",
    name: "Pop",
    description: "Manis di vokal dan jernih di beat.",
    isPremium: false,
    bands: makeBands([-1, 0, 1, 2, 3, 3, 2, 1, 0, -1]),
  },
  {
    id: "jazz",
    name: "Jazz",
    description: "Warm midrange dengan high yang halus.",
    isPremium: false,
    bands: makeBands([3, 2, 1, 1, 0, 0, 1, 2, 1, 0]),
  },
  {
    id: "classical",
    name: "Classical",
    description: "Luas dan natural untuk orkestra.",
    isPremium: false,
    bands: makeBands([0, 0, 0, 0, 0, 0, 1, 3, 4, 3]),
  },
  {
    id: "dance",
    name: "Dance",
    description: "Aggressive bass untuk EDM.",
    isPremium: false,
    bands: makeBands([6, 4, 2, 0, -1, -2, 0, 1, 3, 5]),
  },
  {
    id: "vocal",
    name: "Vocal Booster",
    description: "Vokal lebih maju dan intim.",
    isPremium: false,
    bands: makeBands([-2, -2, -1, 0, 2, 4, 3, 1, 0, -1]),
  },
  {
    id: "electronic",
    name: "Electronic",
    description: "Tuning modern untuk synth & bass.",
    isPremium: false,
    bands: makeBands([4, 3, 1, 0, 0, 1, 1, 2, 4, 5]),
  },
  {
    id: "acoustic",
    name: "Acoustic",
    description: "Detail instrumen kayu dan string.",
    isPremium: false,
    bands: makeBands([2, 2, 1, 0, 1, 1, 2, 3, 3, 2]),
  },
];
