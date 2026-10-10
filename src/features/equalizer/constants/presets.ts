// src/constants/equalizerPresets.ts
import { Preset, EqualizerBand, BandType } from "@/features/equalizer/types";

/**
 * 1. Definisi Frekuensi Standar (ISO Standard)
 * Digunakan sebagai label di atas vertical sliders.
 *
 * 🔥 FIX (2026-10-10): dua nilai pertama dulu 32 & 64, sedangkan yang
 * BENAR-BENAR diterapkan `EQProcessor::kBandFreqs` (native) adalah 31 & 62.
 * Frekuensi tidak pernah dikirim ke native — JS hanya mengirim gain per indeks
 * — jadi `kBandFreqs` adalah satu-satunya sumber kebenaran dan daftar ini
 * murni label. Label 32/64 membuat user melihat angka yang tidak pernah
 * diterapkan; 8 band lain sudah cocok.
 *
 * Diselaraskan ke nilai native supaya label = yang terdengar.
 */
export const EQ_FREQUENCIES = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];

/**
 * Tipe Band untuk Native Engine
 * Lowshelf untuk bass paling ujung, Highshelf untuk ujung treble,
 * sisanya Peaking untuk kontrol frekuensi tengah yang presisi.
 */
export const EQ_BAND_TYPES: BandType[] = [
  "lowshelf", // 32Hz
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "peaking",
  "highshelf", // 16kHz
];

export const DEFAULT_Q = 1.414;

/**
 * 2. Helper: makeBands
 * Mengonversi array gain mentah menjadi objek EqualizerBand yang valid.
 */
export const makeBands = (gains: number[]): EqualizerBand[] => {
  return EQ_FREQUENCIES.map((freq, i) => ({
    id: i,
    frequency: freq,
    gain: gains[i] ?? 0,
    q: DEFAULT_Q,
    type: EQ_BAND_TYPES[i],
  }));
};

/**
 * 3. ALL_PRESETS
 * Daftar preset standar untuk berbagai genre dan skenario penggunaan.
 */
export const ALL_PRESETS: Preset[] = [
  {
    id: "flat",
    name: "Flat",
    description: "Output murni tanpa perubahan fasa.",
    isPremium: false,
    bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
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
  {
    id: "bass-boost",
    name: "Bass Boost",
    description: "Deep punchy bass untuk pecinta low-end.",
    isPremium: false,
    bands: makeBands([6, 5, 3, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: "rock",
    name: "Rock",
    description: "V-Shape klasik bertenaga untuk gitar elektrik.",
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
    description: "Luas dan natural untuk orkestra megah.",
    isPremium: false,
    bands: makeBands([0, 0, 0, 0, 0, 0, 1, 3, 4, 3]),
  },
  {
    id: "dance",
    name: "Dance",
    description: "Aggressive bass dan tajam untuk EDM.",
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
    description: "Tuning modern untuk synth & bass digital.",
    isPremium: false,
    bands: makeBands([4, 3, 1, 0, 0, 1, 1, 2, 4, 5]),
  },
  {
    id: "acoustic",
    name: "Acoustic",
    description: "Detail instrumen kayu dan string yang jernih.",
    isPremium: false,
    bands: makeBands([2, 2, 1, 0, 1, 1, 2, 3, 3, 2]),
  },
];
