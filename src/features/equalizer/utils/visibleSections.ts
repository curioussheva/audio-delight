// src/features/equalizer/utils/visibleSections.ts
//
// Visibilitas seksi layar EQ (GRAFIK / PRESET / MIXER / HEADPHONE / EFEK).
// Disimpan di AsyncStorage sebagai JSON.
//
// Format v3 (2026-11-20, atas permintaan csheva):
//   {"version":3,"sections":{"graph":true,"preset":true,"mixer":true,
//    "headphone":true,"effects":true}}
//
// Default baru: kelima seksi tampil. Default v2 (hanya GRAFIK + EFEK,
// karena layar dinilai "masih terlalu ramai" 2026-11-18) DICABUT atas
// keputusan csheva 2026-11-20: HEADPHONE, MIXER, dan PRESET harus langsung
// terlihat, bukan tersembunyi di balik tombol pengalih. Tombol pengalih
// tetap ada — pengguna tetap bisa menyembunyikan seksi bila mau.
//
// Migrasi: payload format v2 (atau lebih lama, tanpa `version`) TIDAK
// dikenali dan jatuh ke default baru. Ini disengaja, mengikuti pola yang
// sama seperti migrasi v2: default baru harus mencapai pengguna LAMA juga,
// bukan hanya instalasi baru. Trade-off yang sama seperti v2: pengguna yang
// sengaja menyembunyikan seksi di v2 akan melihat semuanya tampil lagi
// sekali, lalu pilihannya yang baru tersimpan dalam format v3 dan dihormati.
// Pilihan pengguna sesudah migrasi tersimpan dalam format v3 dan dihormati.

export interface VisibleSections {
  graph: boolean;
  preset: boolean;
  mixer: boolean;
  headphone: boolean;
  effects: boolean;
}

export type SectionId = keyof VisibleSections;

export const VISIBLE_SECTIONS_VERSION = 3;

/** Default seksi: kelima seksi tampil (2026-11-20, atas permintaan csheva). */
export const DEFAULT_VISIBLE_SECTIONS: VisibleSections = {
  graph: true,
  preset: true,
  mixer: true,
  headphone: true,
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

/** Serialisasi untuk disimpan (format v3). */
export function serializeVisibleSections(sections: VisibleSections): string {
  return JSON.stringify({ version: VISIBLE_SECTIONS_VERSION, sections });
}
