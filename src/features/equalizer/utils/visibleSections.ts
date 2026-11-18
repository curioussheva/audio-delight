// src/features/equalizer/utils/visibleSections.ts
//
// Pilihan tampil/sembunyi seksi layar Equalizer
// (GRAFIK/HEADPHONE/EFEK/MIXER/PRESET) yang
// disimpan ke AsyncStorage supaya tidak reset tiap kali layar dibuka ulang
// (U-P2-44). Logika parse dipisah ke sini supaya bisa diuji Jest tanpa
// React Native.

export interface VisibleSections {
  graph: boolean;
  effects: boolean;
  mixer: boolean;
  headphone: boolean;
  preset: boolean;
}

export const DEFAULT_VISIBLE_SECTIONS: VisibleSections = {
  graph: true,
  effects: true,
  // Declutter 2026-11-18: koreksi headphone + detail band default
  // tertutup — koreksi di-set sekali per perangkat (jarang diubah), dan
  // band bisa diedit langsung dari grafik (drag). Toggle tetap ada;
  // pilihan tersimpan pengguna tidak ditimpa (parse: stored false tetap
  // sembunyi, stored true tetap tampil — hanya instalasi/pengguna tanpa
  // nilai tersimpan yang kena default baru).
  mixer: false,
  headphone: false,
  preset: true,
};

export const VISIBLE_SECTIONS_KEY = "equalizer-visible-sections";

/**
 * Parse nilai tersimpan. Apa pun yang bukan boolean `false` dianggap tampil:
 * kunci yang hilang (data lama/sebagian) tidak boleh mematikan seksi, dan
 * JSON rusak jatuh ke default semua tampil.
 */
export function parseVisibleSections(raw: string | null): VisibleSections {
  if (!raw) return { ...DEFAULT_VISIBLE_SECTIONS };
  try {
    const parsed = JSON.parse(raw) as Partial<VisibleSections>;
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_VISIBLE_SECTIONS };
    }
    return {
      graph: parsed.graph !== false,
      effects: parsed.effects !== false,
      mixer: parsed.mixer !== false,
      headphone: parsed.headphone !== false,
      preset: parsed.preset !== false,
    };
  } catch {
    return { ...DEFAULT_VISIBLE_SECTIONS };
  }
}
