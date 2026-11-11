// src/shared/constants/themes/pristine.ts
//
// Tema "Pristine" (2026-11-11) — bahasa warna brand aplikasi:
// NAVY + SILVER + CHAMPAGNE GOLD, sesuai aset branding (icon play+waveform
// perak di atas navy #0A1628, banner emas "Curious Sheva", poster splash).
//
// Sebelumnya default adalah emerald-noir (hijau-hitam + emerald #059669
// yang nyaring + emas datar #D4AF37): splash dibuka dengan navy/perak/emas,
// lalu UI mendarat di hijau-hitam — dua bahasa yang tidak nyambung.
//
// Prinsip palet:
// - Satu logam hangat (emas champagne) + satu logam dingin (perak) +
//   satu warna dalam (navy). Tidak ada warna kedua yang berebut perhatian.
// - Background noir = #0A1628 persis (sama dengan navy icon + adaptive bg),
//   jadi launcher icon, splash, dan UI menyatu tanpa sambungan.
// - Semua pasangan kunci diverifikasi WCAG AA (4.5:1) sebelum ditulis:
//   tombol Play noir 8.09:1 (dulu 5.13:1), aksen perak 11.64:1,
//   onPrimary/onPrimaryKey lolos themeAccent.test.ts di kedua tema.
// - primary[500] dipakai JUGA sebagai warna teks di ±30 tempat (pola lama
//   yang dulu menghasilkan 170 kegagalan kontras) — jadi 500 di tema terang
//   sengaja gelap (#755C35, 5.77:1 di atas porcelain), bukan emas terangnya.
import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY, BASE_SHADOWS } from "./base";

export const PRISTINE_NOIR: Theme = {
  id: "pristine-noir",
  name: "Pristine Noir",
  description: "Deep navy with champagne gold and silver — the brand theme",
  isDark: true,
  colors: {
    primary: {
      50: "#FBF6EC",
      100: "#F5EAD2",
      200: "#EDD9AC",
      300: "#E2C586",
      400: "#D4B46E",
      500: "#C9A96A", // Champagne gold
      600: "#A98A52",
      700: "#876E42",
      800: "#665434",
      900: "#453A26",
    },
    secondary: {
      500: "#8FA3BF", // Steel blue-grey
    },
    background: {
      primary: "#0A1628", // Navy icon — seamless with launcher + splash
      secondary: "#101E33",
      tertiary: "#17293F",
      elevated: "#1E324F",
      overlay: "rgba(4, 8, 16, 0.65)",
    },
    text: {
      primary: "#F2F5F9",
      secondary: "#B9C5D6",
      tertiary: "#7E8CA6",
      disabled: "#4A5A75",
      inverse: "#0A1628",
    },
    accent: {
      blue: "#7FA8D0", // Steel blue — benar-benar biru (dulu emas)
      purple: "#9B8AFB",
      orange: "#E8A85C",
      red: "#F08070", // Coral red — #E0655A tidak lolos AA di navy
      green: "#34B98A",
      primary: "#C7D0DC", // Silver
      onPrimary: "#0A1628",
      onPrimaryKey: "#0A1628",
    },
    status: {
      success: "#34B98A",
      warning: "#E8A85C",
      error: "#F08070",
      info: "#7FA8D0",
    },
    border: {
      light: "#24344D",
      medium: "#3A4E6E",
      heavy: "#101E33",
    },
    gradient: {
      primary: ["#C9A96A", "#0A1628"],
      accent: ["#E5D5AC", "#A98A52"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const PRISTINE_PORCELAIN: Theme = {
  id: "pristine-porcelain",
  name: "Pristine Porcelain",
  description: "Warm white porcelain with bronze gold and navy — light pair",
  isDark: false,
  colors: {
    primary: {
      50: "#F8F2E6",
      100: "#F0E5CB",
      200: "#E2D0A6",
      300: "#CDB483",
      400: "#AB8F5E",
      500: "#755C35", // Deep bronze — sengaja gelap supaya terbaca
      600: "#63502E", // sebagai teks di atas porcelain (5.77:1)
      700: "#4F4025",
      800: "#3D321D",
      900: "#2A2214",
    },
    secondary: {
      500: "#4A6FA5", // Steel blue
    },
    background: {
      primary: "#F7F5F0", // Warm porcelain white
      secondary: "#EFEAE0",
      tertiary: "#E4DDCF",
      elevated: "#FFFFFF",
      overlay: "rgba(10, 22, 40, 0.45)",
    },
    text: {
      primary: "#0A1628", // Navy
      secondary: "#3D4A61",
      tertiary: "#5B6A83",
      disabled: "#9AA5B8",
      inverse: "#F7F5F0",
    },
    accent: {
      blue: "#4A6FA5",
      purple: "#6D5BD0",
      orange: "#9A6420",
      red: "#C0453A",
      green: "#1E7A5C",
      primary: "#755C35", // Bronze gold — sama dengan primary[500]
      onPrimary: "#F7F5F0",
      onPrimaryKey: "#F7F5F0",
    },
    status: {
      success: "#1E7A5C",
      warning: "#9A6420",
      error: "#C0453A",
      info: "#4A6FA5",
    },
    border: {
      light: "#D8D2C4",
      medium: "#B9B2A2",
      heavy: "#EFEAE0",
    },
    gradient: {
      primary: ["#755C35", "#F7F5F0"],
      accent: ["#C9A96A", "#7A5F36"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};
