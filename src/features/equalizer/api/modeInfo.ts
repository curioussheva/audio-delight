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
    hint: "tanpa pemrosesan",
    description:
      "Output murni tanpa pemrosesan: EQ, DSP dan retune dilewati.",
  },
  dsp: {
    label: "DSP",
    hint: "EQ & efek",
    description:
      "EQ, bass boost, pelebar stereo dan koreksi headphone aktif.",
  },
  immersive: {
    label: "Solfeggio",
    hint: "resonansi",
    description: "Resonansi 528 Hz + tuning A=432, tanpa EQ/DSP.",
  },
};
