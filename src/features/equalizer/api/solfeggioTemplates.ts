// src/features/equalizer/api/solfeggioTemplates.ts
//
// Template Solfeggio: pasangan frekuensi + intensitas default untuk
// resonator Solfeggio (engine native, ImmersiveStage).
//
// Satu template = titik awal, bukan kunci: setelah dipilih, user bebas
// mengubah intensitas (slider) atau frekuensi — template yang aktif lalu
// jadi "Kustom" (lihat matchSolfeggioTemplate).
//
// Copy asosiasi ditulis sebagai atribusi TRADISIONAL ("secara tradisional
// dikaitkan dengan…") — bukan klaim medis/penyembuhan.

export interface SolfeggioTemplate {
  /** Id stabil, dipersist di AsyncStorage (playerStore). */
  id: string;
  /** Nama yang tampil di picker. */
  name: string;
  /** Frekuensi resonator (Hz). */
  freq: number;
  /** Intensitas default (0..1) saat template dipilih. */
  intensity: number;
  /** Satu baris asosiasi tradisional — bukan klaim medis. */
  association: string;
}

/** Rentang frekuensi Solfeggio yang dijepit di store (Hz). Native
 *  (AudioState.h) menerima 20–2000; batas bawah 100 menjaga template
 *  tetap di wilayah frekuensi Solfeggio yang dimaksud. */
export const SOLFEGGIO_FREQ_MIN = 100;
export const SOLFEGGIO_FREQ_MAX = 2000;

/** Frekuensi default engine (ImmersiveStage / AudioState.h). */
export const DEFAULT_SOLFEGEGGIO_FREQ = 528;

/** Template default — sama dengan frekuensi default engine. */
export const DEFAULT_SOLFEGEGGIO_TEMPLATE_ID = "fokus";

/** Id untuk keadaan "tidak ada template yang cocok". */
export const CUSTOM_TEMPLATE_ID = "kustom";

export const SOLFEGGIO_TEMPLATES: readonly SolfeggioTemplate[] = [
  {
    id: "tenang",
    name: "Tenang",
    freq: 396,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan rasa tenang dan pelepasan ketegangan.",
  },
  {
    id: "perubahan",
    name: "Perubahan",
    freq: 417,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan perubahan dan awal yang baru.",
  },
  {
    id: "fokus",
    name: "Fokus",
    freq: 528,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan fokus dan kejernihan pikiran.",
  },
  {
    id: "harmoni",
    name: "Harmoni",
    freq: 639,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan harmoni dan hubungan antarmanusia.",
  },
  {
    id: "intuisi",
    name: "Intuisi",
    freq: 741,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan intuisi dan ekspresi diri.",
  },
  {
    id: "seimbang",
    name: "Seimbang",
    freq: 852,
    intensity: 0.5,
    association:
      "Secara tradisional dikaitkan dengan keseimbangan dan ketenangan batin.",
  },
  {
    // P2 audit BitPerfect/Solfeggio 2026-11-20: namanya dulu "963 Hz"
    // (nama frekuensi), tidak konsisten dengan 6 template lain yang
    // memakai nama asosiasi. Id stabil "963" tidak berubah — hanya nama
    // tampil; "963 Hz" tetap tampil sebagai sub-teks chip.
    id: "963",
    name: "Kesadaran",
    freq: 963,
    intensity: 0.4,
    association:
      "Secara tradisional dikaitkan dengan kesadaran dan ketenangan mendalam.",
  },
] as const;

export function getSolfeggioTemplate(
  id: string,
): SolfeggioTemplate | undefined {
  return SOLFEGGIO_TEMPLATES.find((t) => t.id === id);
}

/** Jepit frekuensi ke rentang yang didukung (100–2000 Hz). */
export function clampSolfeggioFreq(freq: number): number {
  if (!Number.isFinite(freq)) return DEFAULT_SOLFEGEGGIO_FREQ;
  return Math.min(
    SOLFEGGIO_FREQ_MAX,
    Math.max(SOLFEGGIO_FREQ_MIN, freq),
  );
}

/**
 * Cari template yang cocok dengan pasangan frekuensi + intensitas saat ini.
 * Kembalikan `null` kalau tidak ada yang cocok (= "Kustom").
 *
 * Toleransi kecil karena intensitas bisa datang dari slider (langkah 0,01)
 * sehingga 0,4 hasil geser belum tentu bit-identik dengan 0,4 literal.
 */
export function matchSolfeggioTemplate(
  freq: number,
  intensity: number,
): SolfeggioTemplate | null {
  const found = SOLFEGGIO_TEMPLATES.find(
    (t) =>
      Math.abs(t.freq - freq) <= 0.5 &&
      Math.abs(t.intensity - intensity) <= 0.005,
  );
  return found ?? null;
}

/** Id template yang aktif untuk pasangan frekuensi + intensitas saat ini,
 *  atau "kustom" kalau tidak ada yang cocok. */
export function activeSolfeggioTemplateId(
  freq: number,
  intensity: number,
): string {
  return matchSolfeggioTemplate(freq, intensity)?.id ?? CUSTOM_TEMPLATE_ID;
}
