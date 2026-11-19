// src/features/equalizer/api/brainwaveBands.ts
//
// Pita denyut binaural (brainwave entrainment) untuk mode Immersive/Solfeggio.
//
// Satu pita = satu frekuensi denyut (selisih antar kanal, Hz) yang
// benar-benar dimainkan engine — bukan rentang. Native (BrainwaveGenerator)
// hanya memainkan 5 frekuensi tetap — Delta 2,5 / Theta 6 / Alpha 10 /
// Beta 18 / Gamma 40 Hz, carrier tetap 200 Hz — dan `setBrainwaveFreq`
// menerima Hz denyut 0..40 yang dipetakan ImmersiveStage ke pita
// (<4 Delta, <8 Theta, <13 Alpha, <30 Beta, sisanya Gamma). 0 = mati
// (gate di ImmersiveStage: generate tidak dipanggil — passthrough
// bit-exact). Volume denyut mengikuti resonanceIntensity (ImmersiveStage:
// `mBrainwave.setVolume(params.resonanceIntensity)`); intensitas 0 =
// denyut tidak terdengar walau frekuensi > 0.
//
// CATATAN KEJUJURAN: komentar AudioState.h (C-P2) menulis rencana UI
// "Beta 20" — yang dimainkan generator untuk BETA adalah 18,0 Hz
// (BrainwaveGenerator::beatFrequency). UI menampilkan 18 Hz, bukan 20.
//
// Asosiasi ditulis sebagai atribusi TRADISIONAL ("secara tradisional
// dikaitkan dengan…") — bukan klaim medis/penyembuhan. Sama seperti
// template Solfeggio.

export interface BrainwaveBand {
  /** Id stabil, dipakai membandingkan dengan nilai tersimpan. */
  id: string;
  /** Nama yang tampil di picker. */
  name: string;
  /** Frekuensi denyut yang dimainkan (Hz). 0 = mati. */
  freq: number;
  /** Satu baris asosiasi tradisional — bukan klaim medis. Kosong untuk "Mati". */
  association: string;
}

/** Frekuensi denyut default engine (ImmersiveStage / AudioState.h): mati. */
export const DEFAULT_BRAINWAVE_FREQ = 0;

/** Batas atas yang diterima native (AudioState.h menjepit 0..40). */
export const BRAINWAVE_FREQ_MAX = 40;

export const BRAINWAVE_BANDS: readonly BrainwaveBand[] = [
  {
    id: "mati",
    name: "Mati",
    freq: 0,
    association: "",
  },
  {
    id: "delta",
    name: "Delta",
    freq: 2.5,
    association:
      "Secara tradisional dikaitkan dengan tidur dalam.",
  },
  {
    id: "theta",
    name: "Theta",
    freq: 6,
    association:
      "Secara tradisional dikaitkan dengan meditasi dan kantuk.",
  },
  {
    id: "alpha",
    name: "Alpha",
    freq: 10,
    association:
      "Secara tradisional dikaitkan dengan rileks dan terjaga.",
  },
  {
    id: "beta",
    name: "Beta",
    freq: 18,
    association:
      "Secara tradisional dikaitkan dengan fokus dan kewaspadaan.",
  },
  {
    id: "gamma",
    name: "Gamma",
    freq: 40,
    association:
      "Secara tradisional dikaitkan dengan kognisi tinggi.",
  },
] as const;

export function getBrainwaveBand(id: string): BrainwaveBand | undefined {
  return BRAINWAVE_BANDS.find((b) => b.id === id);
}

/** Jepit frekuensi denyut ke rentang yang didukung native (0–40 Hz). */
export function clampBrainwaveFreq(freq: number): number {
  if (!Number.isFinite(freq)) return DEFAULT_BRAINWAVE_FREQ;
  return Math.min(BRAINWAVE_FREQ_MAX, Math.max(0, freq));
}

/**
 * Cari pita yang memainkan frekuensi ini — ambang yang SAMA dengan
 * ImmersiveStage::mapFrequencyToBrainwaveType, supaya UI selalu
 * menampilkan apa yang benar-benar dimainkan native (bukan tebakan).
 * 0 = "mati". Nilai di luar pita kanonis (mis. simpanan lama 5 Hz)
 * tetap dipetakan ke pita yang memainkannya (Theta), bukan "mati".
 */
export function matchBrainwaveBand(freq: number): BrainwaveBand {
  if (!Number.isFinite(freq) || freq <= 0) return BRAINWAVE_BANDS[0];
  if (freq < 4) return BRAINWAVE_BANDS[1];
  if (freq < 8) return BRAINWAVE_BANDS[2];
  if (freq < 13) return BRAINWAVE_BANDS[3];
  if (freq < 30) return BRAINWAVE_BANDS[4];
  return BRAINWAVE_BANDS[5];
}

/** Id pita yang aktif untuk frekuensi denyut saat ini. */
export function activeBrainwaveBandId(freq: number): string {
  return matchBrainwaveBand(freq).id;
}
