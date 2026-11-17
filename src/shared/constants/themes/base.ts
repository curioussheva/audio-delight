import { ThemeSpacing, ThemeTypography, ThemeShadows, ThemeRadius } from "./types";

/**
 * Nama keluarga font seperti didaftarkan ke expo-font (keputusan redesign
 * final 2026-11-18: Playfair Display = display, Inter = body/UI).
 *
 * Didefinisikan DI SINI (lapisan konstanta murni), bukan di
 * `shared/utils/fonts.ts` — file itu mengimpor `expo-font` (modul native),
 * dan lapisan tema harus tetap bisa diuji jest logika-murni tanpa
 * react-native/expo. `fonts.ts` mengimpor + mengekspor ulang konstanta ini.
 */
export const FONT_FAMILY = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semiBold: "Inter-SemiBold",
  bold: "Inter-Bold",
  display: "PlayfairDisplay-Regular",
  displayBold: "PlayfairDisplay-Bold",
} as const;

export type AppFontFamily = (typeof FONT_FAMILY)[keyof typeof FONT_FAMILY];

export const BASE_SPACING: ThemeSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  s10: 10,
  s12: 12,
  md: 16,
  s20: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

// Pemetaan ukuran font saat migrasi (Fase 0 §3.2, diputuskan Fase 1):
// 19 nilai fontSize unik (7–48) tidak bisa semuanya jadi token. Nilai yang
// tidak ada di skala — 11 (59×, dipakai sebagai "label", terbanyak di
// Settings 15× + EQ 7×) dan 13 (47×, teks isi sekunder) — dipetakan ke peran
// terdekat: 11 → caption (12), 13 → body2 (14). Keduanya naik 1 px, jadi
// migrasi juga memperbaiki keterbacaan teks mungil (Fase 5). Peran lain
// sudah ada di skala: h1 32 / h2 28 / h3 24 / h4 20 / body1 16 / body2 14 /
// caption 12 / button 16.
export const BASE_TYPOGRAPHY: ThemeTypography = {
  fontFamily: {
    regular: FONT_FAMILY.regular,
    medium: FONT_FAMILY.medium,
    semiBold: FONT_FAMILY.semiBold,
    bold: FONT_FAMILY.bold,
    display: FONT_FAMILY.display,
    displayBold: FONT_FAMILY.displayBold,
  },
  h1: { fontSize: 32, fontWeight: "700", lineHeight: 40 },
  h2: { fontSize: 28, fontWeight: "700", lineHeight: 36 },
  h3: { fontSize: 24, fontWeight: "600", lineHeight: 32 },
  h4: { fontSize: 20, fontWeight: "600", lineHeight: 28 },
  body1: { fontSize: 16, fontWeight: "400", lineHeight: 24 },
  body2: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  button: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
};

/** Skala radius (Fase 1): sm = elemen kecil, md = kartu, lg/xl = permukaan besar, pill = pill/chip. */
export const BASE_RADIUS: ThemeRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// Bayangan memakai warna hangat, bukan hitam pekat (Fase 1): shadowColor
// "#1D130C" (cokelat gelap palet hangat) memberi tint hangat di latar terang
// dan nyaris tak terlihat di latar gelap — sama halusnya dengan "#000".
export const BASE_SHADOWS: ThemeShadows = {
  sm: {
    shadowColor: "#1D130C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#1D130C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#1D130C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: "#1D130C",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
};
