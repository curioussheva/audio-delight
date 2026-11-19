import type { AudioMode } from "@/features/player/store/playerStore";

/** Info tampilan per mode audio — label, hint singkat, dan deskripsi satu
    kalimat. B5: sakelar mode harus menyebut apa yang dilakukan tiap mode,
    bukan cuma namanya. Modul murni, tanpa dependensi UI. */
export interface ModeInfo {
  label: string;
  hint: string;
  description: string;
}

export const MODE_INFO: Record<AudioMode, ModeInfo> = {
  "bit-perfect": {
    label: "Bit-Perfect",
    hint: "tanpa DSP",
    description:
      "Meminta jalur langsung ke perangkat (kalau device menerima exclusive): EQ, DSP dan retune dilewati, hanya fade anti-klik.",
  },
  dsp: {
    label: "DSP",
    hint: "EQ & efek",
    description:
      "EQ, bass boost, pelebar stereo, reverb, HRTF, dan koreksi headphone aktif; master gain mengatur level akhir.",
  },
  immersive: {
    label: "Solfeggio",
    hint: "resonansi",
    // Jujur soal default (P1 audit BitPerfect/Solfeggio 2026-11-20):
    // tuning default A=440 (tuningCents: 0 di playerStore) — A=432 hanya
    // bila user menekan presetnya; dan "tanpa EQ/DSP" salah — koreksi
    // headphone, tuning, dan lebar spatial (dari nilai widener DSP) tetap
    // memproses di mode ini. Yang dilewati hanya EQ 10-band/efek DSP.
    description:
      "Resonansi 528 Hz · tuning A=440 (A=432 tersedia). Tanpa EQ 10-band/efek DSP — koreksi headphone, tuning, dan lebar spatial tetap berlaku.",
  },
};
