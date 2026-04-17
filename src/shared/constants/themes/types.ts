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
  accent?: {
    blue?: string;
    purple?: string;
    orange?: string;
    red?: string;
    green?: string;
    primary?: string;
    secondary?: string;
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
    bold?: string;
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
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl?: number;
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
  shadows: ThemeShadows;
}
