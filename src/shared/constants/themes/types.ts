// src/shared/constants/themes/types.ts

export interface ThemeColors {
  primary: {
    50?: string;
    100?: string;
    200?: string;
    300?: string;
    400?: string;
    500: string;
    600?: string;
    700?: string;
    800?: string;
    900?: string;
  };
  secondary?: {
    50?: string;
    100?: string;
    200?: string;
    300?: string;
    400?: string;
    500: string;
    600?: string;
    700?: string;
    800?: string;
    900?: string;
  };
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    elevated: string;
    overlay?: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
  };
  // Warna aksen WAJIB lengkap.
  //
  // Dulu semuanya opsional, jadi setiap pemakaian harus menulis rantai
  // fallback (`accent?.orange ?? status.warning ?? primary[500]`). Rantai itu
  // yang menghasilkan 170 kegagalan kontras: `primary[500]` di tema gelap
  // justru warna gelap (rasio 1.06-1.32), sehingga label dan ikon aksen nyaris
  // tak terlihat. Kontrak yang jelas lebih murah daripada 170 tambalan.
  accent: {
    blue: string;
    purple: string;
    orange: string;
    red: string;
    green: string;
    /**
     * Warna aksen utama tema. Ini yang sudah dipakai UI sebagai `accent.primary`.
     */
    primary: string;
    /**
     * Warna TEKS di atas permukaan berisi `accent.primary`.
     *
     * Perlu token terpisah karena `accent.primary` dan `primary[500]` pada 7
     * dari 20 tema ternyata warna BERLAWANAN terang/gelap - jaraknya sampai
     * 14.76:1 (charcoal-black: accent.primary `#E4E4E7` vs primary[500]
     * `#121212`). Tidak ada satu pun warna yang bisa lolos AA di keduanya.
     */
    onPrimary: string;
    /**
     * Warna TEKS di atas permukaan berisi `primary[500]`.
     *
     * Terpisah dari `onPrimary` karena alasan di atas. Diverifikasi oleh
     * `src/__tests__/shared/utils/themeAccent.test.ts`.
     */
    onPrimaryKey: string;
  };
  status: {
    success: string;
    warning?: string;
    error: string;
    info?: string;
  };
  warning?: Record<number, string>;
  border: {
    medium: string;
    light?: string;
    primary?: string;
    heavy?: string;
  };
  gradient?: {
    primary: string[];
    secondary?: string[];
    surface?: string[];
    accent?: string[];
  };
}

export interface ThemeTypography {
  fontFamily?: {
    regular?: string;
    medium?: string;
    semiBold?: string;
    bold?: string;
    /** Serif display (Playfair Display) — judul layar, judul lagu, angka besar. */
    display?: string;
    /** Serif display tebal (Playfair Display Bold) — judul utama. */
    displayBold?: string;
  };
  fontSize?: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  lineHeight?: {
    tight: number;
    normal: number;
    loose: number;
  };
  h1?: { fontSize: number; fontWeight: string; lineHeight: number };
  h2?: { fontSize: number; fontWeight: string; lineHeight: number };
  h3?: { fontSize: number; fontWeight: string; lineHeight: number };
  h4?: { fontSize: number; fontWeight: string; lineHeight: number };
  body1?: { fontSize: number; fontWeight: string; lineHeight: number };
  body2?: { fontSize: number; fontWeight: string; lineHeight: number };
  caption?: { fontSize: number; fontWeight: string; lineHeight: number };
  button?: { fontSize: number; fontWeight: string; lineHeight: number };
  body?: { fontSize: number; lineHeight: number };
}

export interface ThemeSpacing {
  xxs?: number;
  xs: number;
  sm: number;
  // Nilai sela dari kebiasaan nyata kode (Fase 0 §3.3): 12 dan 20 adalah
  // nilai tersering ke-2/3 (107× dan 72×) tapi tidak ada di skala lama
  // 2/4/8/16/24/32/48/64. Ditambah di Fase 1 supaya migrasi spacing
  // (Fase 3) tidak memaksa perubahan visual yang tidak diniatkan.
  s10?: number;
  s12?: number;
  md: number;
  s20?: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl?: number;
}

/**
 * Skala radius (Fase 1, dari pengelompokan nyata Fase 0 §3.4).
 *
 * Pemakaian radius mengumpul di 8/12/16/20 + pill 999, tapi tanpa
 * pembagian peran yang konsisten (tabrakan T1/T2). Skala ini memberi
 * peran: sm = elemen kecil, md = kartu, lg/xl = permukaan besar,
 * pill = pill/chip. Migrasi per layar mengikuti di Fase 3.
 */
export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
}

export interface ThemeShadows {
  sm: object;
  md: object;
  lg: object;
  xl?: object;
}

export type ThemeId =
  // Original themes
  | "deep-navy"
  | "obsidian"
  | "light-elegant"
  | "light-silver"
  | "light-gray"
  | "pure-white"
  | "midnight-blue"
  | "charcoal-black"
  | "forest-green"
  | "ocean-wave"
  | "golden-hour"
  | "rose-gold"
  | "neon-cyber"
  | "sunset-orange"
  | "emerald-noir"
  // pristine.ts themes
  | "pristine-noir"
  | "pristine-porcelain"
  // warm.ts themes (Fase 1 redesign) — tema hangat, jadi default
  | "pristine-ember"
  | "pristine-hearth"
  // dark.ts themes
  | "cozy-metallic"
  | "blue-jeans"
  | "vinyl-noir"
  | "aged-whiskey"
  | "graphite-slate";

export interface Theme {
  id: ThemeId;
  name: string;
  description?: string;
  isDark: boolean;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  shadows: ThemeShadows;
}
