// src/features/equalizer/utils/visibleSections.ts
//
// Pilihan tampil/sembunyi seksi layar Equalizer (GRAFIK/EFEK/MIXER) yang
// disimpan ke AsyncStorage supaya tidak reset tiap kali layar dibuka ulang
// (U-P2-44). Logika parse dipisah ke sini supaya bisa diuji Jest tanpa
// React Native.

export interface VisibleSections {
  graph: boolean;
  effects: boolean;
  mixer: boolean;
}

export const DEFAULT_VISIBLE_SECTIONS: VisibleSections = {
  graph: true,
  effects: true,
  mixer: true,
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
    };
  } catch {
    return { ...DEFAULT_VISIBLE_SECTIONS };
  }
}
