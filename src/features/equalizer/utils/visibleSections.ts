// src/features/equalizer/utils/visibleSections.ts
//
// Visibilitas seksi layar EQ (GRAFIK / PRESET / MIXER / HEADPHONE / EFEK).
// Disimpan di AsyncStorage sebagai JSON.
//
// Format v2 (2026-11-19, ronde clean-cozy):
//   {"version":2,"sections":{"graph":true,"preset":false,"mixer":false,
//    "headphone":false,"effects":true}}
//
// Default baru: hanya GRAFIK + EFEK yang tampil. Layar dinilai "masih terlalu
// ramai" (2026-11-18, semua 5 seksi tampil) — PRESET, MIXER, dan HEADPHONE
// disembunyikan secara default, bisa ditampilkan lewat tombol pengalih.
//
// Migrasi: payload format lama (tanpa `version`, semua kunci boolean di root)
// TIDAK dikenali dan jatuh ke default baru. Ini disengaja: default declutter
// harus mencapai pengguna LAMA juga, bukan hanya instalasi baru. Pilihan
// pengguna sesudah migrasi tersimpan dalam format v2 dan dihormati.

export interface VisibleSections {
  graph: boolean;
  preset: boolean;
  mixer: boolean;
  headphone: boolean;
  effects: boolean;
}

export type SectionId = keyof VisibleSections;

export const VISIBLE_SECTIONS_VERSION = 2;

/** Default seksi: hanya GRAFIK + EFEK. */
export const DEFAULT_VISIBLE_SECTIONS: VisibleSections = {
  graph: true,
  preset: false,
  mixer: false,
  headphone: false,
  effects: true,
};

export const VISIBLE_SECTIONS_KEY = "equalizer-visible-sections";

const parseSectionValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const parseVersionedPayload = (value: unknown): VisibleSections => {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_VISIBLE_SECTIONS;
  }
  const payload = value as { version?: unknown; sections?: unknown };
  if (payload.version !== VISIBLE_SECTIONS_VERSION) {
    return DEFAULT_VISIBLE_SECTIONS;
  }
  if (typeof payload.sections !== "object" || payload.sections === null) {
    return DEFAULT_VISIBLE_SECTIONS;
  }
  const sections = payload.sections as Partial<Record<SectionId, unknown>>;
  return {
    graph: parseSectionValue(sections.graph, DEFAULT_VISIBLE_SECTIONS.graph),
    preset: parseSectionValue(
      sections.preset,
      DEFAULT_VISIBLE_SECTIONS.preset,
    ),
    mixer: parseSectionValue(sections.mixer, DEFAULT_VISIBLE_SECTIONS.mixer),
    headphone: parseSectionValue(
      sections.headphone,
      DEFAULT_VISIBLE_SECTIONS.headphone,
    ),
    effects: parseSectionValue(
      sections.effects,
      DEFAULT_VISIBLE_SECTIONS.effects,
    ),
  };
};

/**
 * Urai string tersimpan menjadi visibilitas seksi. String kosong, JSON rusak,
 * format lama (tanpa version), atau version yang tidak dikenali semuanya
 * jatuh ke DEFAULT_VISIBLE_SECTIONS (migrasi sekali jalan).
 */
export function parseVisibleSections(raw: string | null): VisibleSections {
  if (!raw) return { ...DEFAULT_VISIBLE_SECTIONS };
  try {
    return parseVersionedPayload(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_VISIBLE_SECTIONS };
  }
}

/** Serialisasi untuk disimpan (format v2). */
export function serializeVisibleSections(sections: VisibleSections): string {
  return JSON.stringify({ version: VISIBLE_SECTIONS_VERSION, sections });
}
