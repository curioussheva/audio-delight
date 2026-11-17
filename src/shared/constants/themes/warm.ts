// src/shared/constants/themes/warm.ts
//
// Tema "hangat" (Fase 1 redesign, keputusan final 2026-11-18) — pasangan
// terang + gelap dari palet splashscreen, jadi DEFAULT + identitas aplikasi
// (hanya instalasi baru; tema lama dan pilihan tersimpan tidak ditimpa).
//
// Palet usulan rencana:
// - Latar utama light #FDF9F1, dark #1D130C
// - Aksen amber #B7791F, burgundy #7A2E3A, chrome silver #C0C4CC (kecil)
// - Teks utama #2E2118
//
// Prinsip palet (mengikuti pristine.ts):
// - `primary[500]` dipakai JUGA sebagai warna teks di ±30 tempat, jadi di
//   tema terang 500 sengaja gelap (#8A5A1B, 5.62:1 di atas #FDF9F1), bukan
//   amber terangnya; di tema gelap 500 = amber #B7791F (5.01:1 di atas
//   #1D130C). Keduanya lolos AA dan dikunci themeAccent.test.ts.
// - `accent.primary` = amber #B7791F di kedua tema, dengan `onPrimary`
//   gelap #1D130C (5.01:1 di atas amber) — teks gelap di atas amber, bukan
//   putih (putih di atas amber hanya 3.47:1, gagal AA).
// - `gradient.primary` = gradient hangat statis Player (2–3 stop, vertikal,
//   subtle, tidak dianimasikan): gelap amber → cokelat → #1D130C; terang
//   tint amber → #FDF9F1.
import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY, BASE_SHADOWS, BASE_RADIUS } from "./base";

export const PRISTINE_EMBER: Theme = {
  id: "pristine-ember",
  name: "Pristine Ember",
  description:
    "Warm dark brown with amber glow — the default warm theme (dark)",
  isDark: true,
  colors: {
    primary: {
      50: "#FBF6EC",
      100: "#F5EAD2",
      200: "#EDD9AC",
      300: "#E2C586",
      400: "#D4B46E",
      500: "#B7791F", // Amber — 5.01:1 di atas #1D130C
      600: "#96611A",
      700: "#744C15",
      800: "#543812",
      900: "#38250C",
    },
    secondary: {
      500: "#B08D57", // Muted bronze
    },
    background: {
      primary: "#1D130C", // Cokelat sangat gelap — ruang dengar malam hari
      secondary: "#251A10",
      tertiary: "#2E2013",
      elevated: "#3A2A18",
      overlay: "rgba(13, 9, 5, 0.65)",
    },
    text: {
      primary: "#FDF9F1", // Warm off-white
      secondary: "#E5DCCB",
      tertiary: "#B8A98F",
      disabled: "#6E5F4B",
      inverse: "#1D130C",
    },
    accent: {
      blue: "#7FA8D0", // Steel blue
      purple: "#9B8AFB",
      orange: "#E8A85C",
      red: "#F08070", // Coral red
      green: "#34B98A",
      primary: "#B7791F", // Amber — aksen identitas hangat
      onPrimary: "#1D130C",
      onPrimaryKey: "#1D130C",
    },
    status: {
      success: "#34B98A",
      warning: "#E8A85C",
      error: "#F08070",
      info: "#7FA8D0",
    },
    border: {
      light: "#3A2A18",
      medium: "#54402A",
      heavy: "#251A10",
    },
    gradient: {
      primary: ["#B7791F", "#5C3D16", "#1D130C"],
      accent: ["#E8A85C", "#B7791F"],
    },
  },
  spacing: BASE_SPACING,
  radius: BASE_RADIUS,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const PRISTINE_HEARTH: Theme = {
  id: "pristine-hearth",
  name: "Pristine Hearth",
  description:
    "Warm off-white with bronze amber — the default warm theme (light)",
  isDark: false,
  colors: {
    primary: {
      50: "#FBF6EC",
      100: "#F3E7CE",
      200: "#E6D3A8",
      300: "#D3B57E",
      400: "#B8945A",
      500: "#8A5A1B", // Deep bronze — sengaja gelap supaya terbaca
      600: "#71491A", // sebagai teks di atas #FDF9F1 (5.62:1)
      700: "#573A15",
      800: "#3F2B10",
      900: "#2A1D0B",
    },
    secondary: {
      500: "#4A6FA5", // Steel blue
    },
    background: {
      primary: "#FDF9F1", // Warm off-white
      secondary: "#F3EDE0",
      tertiary: "#EAE1CF",
      elevated: "#FFFFFF",
      overlay: "rgba(29, 19, 12, 0.45)",
    },
    text: {
      primary: "#2E2118", // Cokelat-hitam hangat
      secondary: "#5A4632",
      tertiary: "#7D6B54",
      disabled: "#A89A83",
      inverse: "#FDF9F1",
    },
    accent: {
      blue: "#4A6FA5",
      purple: "#6D5BD0",
      orange: "#9A6420",
      red: "#C0453A",
      green: "#1E7A5C",
      primary: "#B7791F", // Amber — aksen identitas hangat
      onPrimary: "#1D130C",
      onPrimaryKey: "#FDF9F1",
    },
    status: {
      success: "#1E7A5C",
      warning: "#9A6420",
      error: "#C0453A",
      info: "#4A6FA5",
    },
    border: {
      light: "#E0D6C2",
      medium: "#C4B89F",
      heavy: "#F3EDE0",
    },
    gradient: {
      primary: ["#EFD9A8", "#FDF9F1"],
      accent: ["#E8C88F", "#B7791F"],
    },
  },
  spacing: BASE_SPACING,
  radius: BASE_RADIUS,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};
