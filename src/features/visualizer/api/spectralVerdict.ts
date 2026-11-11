// src/features/visualizer/api/spectralVerdict.ts
//
// Verdict dari hasil ukur spektral (FFT native) vs klaim file.
// Logika MURNI — tidak mengimpor modul native, jadi bisa diuji Jest.
//
// Dibuat 2026-11-11 (deteksi file hi-res/lossless palsu).
//
// Aturan (ambang dipilih dari perilaku codec yang umum):
//   - upsample: file mengaku > 48 kHz tapi konten berhenti di bawah
//     24 kHz. CD 44,1 kHz punya tembok di 22,05 kHz; apa pun di atas
//     48 kHz yang mentok di situ hampir pasti upsample dari CD.
//   - lossy-source: wadah lossless tapi cutoff di bawah 18 kHz.
//     MP3 128k mentok ~16 kHz, 320k ~20 kHz. Ambang 18 kHz memberi
//     ruang untuk rekaman yang memang sepi di frekuensi tinggi.
//   - padding: file mengaku 24-bit tapi 8 bit bawah semuanya nol
//     (rasio LSB-16 > 0,99) — isi 16-bit yang dipindah ke wadah 24-bit.
//
// Semua verdict "terduga" (suspected), bukan vonis: spektrum tidak bisa
// membuktikan provenance studio. Yang ditampilkan ke pengguna adalah
// PENGUKURAN ("konten berhenti di X kHz") + dugaan, bukan cap mutlak.

export type SpectralVerdictKind =
  | "consistent"
  | "upsample"
  | "lossy-source"
  | "padding"
  | "unmeasured";

export interface SpectralVerdict {
  kind: SpectralVerdictKind;
  notes: string[];
}

export interface SpectralMeasurement {
  measuredCutoffHz: number;
  lsbZeroRatio16: number;
}

const UPSAMPLE_CUTOFF_HZ = 24000;
const LOSSY_CUTOFF_HZ = 18000;
const PADDING_RATIO = 0.99;

function khz(hz: number): string {
  return `${(hz / 1000).toFixed(1)} kHz`;
}

export function deriveSpectralVerdict(params: {
  declaredSampleRate: number;
  declaredBitDepth: number;
  isLosslessContainer: boolean;
  spectral: SpectralMeasurement | null;
}): SpectralVerdict {
  const { declaredSampleRate, declaredBitDepth, isLosslessContainer, spectral } =
    params;

  if (!spectral || !(spectral.measuredCutoffHz > 0)) {
    return { kind: "unmeasured", notes: [] };
  }

  const notes: string[] = [];
  let kind: SpectralVerdictKind = "consistent";

  if (declaredSampleRate > 48000 && spectral.measuredCutoffHz < UPSAMPLE_CUTOFF_HZ) {
    kind = "upsample";
    notes.push(
      `Konten berhenti di ${khz(spectral.measuredCutoffHz)} padahal file mengaku ${(declaredSampleRate / 1000).toFixed(1)} kHz — kemungkinan upsample dari CD (44,1 kHz)`,
    );
  }

  if (
    isLosslessContainer &&
    spectral.measuredCutoffHz < LOSSY_CUTOFF_HZ
  ) {
    if (kind === "consistent") kind = "lossy-source";
    notes.push(
      `Cutoff di ${khz(spectral.measuredCutoffHz)} — kemungkinan sumber lossy (MP3/AAC) yang dibungkus ulang sebagai lossless`,
    );
  }

  if (
    declaredBitDepth === 24 &&
    isLosslessContainer &&
    spectral.lsbZeroRatio16 > PADDING_RATIO
  ) {
    if (kind === "consistent") kind = "padding";
    notes.push(
      `8 bit bawah semuanya nol (rasio LSB-16 ${(spectral.lsbZeroRatio16 * 100).toFixed(0)}%) — kemungkinan padding dari 16-bit`,
    );
  }

  if (kind === "consistent") {
    notes.push(
      `Konten terukur sampai ${khz(spectral.measuredCutoffHz)} — konsisten dengan klaim file`,
    );
  }

  return { kind, notes };
}
