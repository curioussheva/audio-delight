// src/shared/constants/themes/types.ts

export interface ThemeColors {
  primary: {
    500: string;
    600?: string;
  };
  secondary?: {
    500: string;
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
    success?: string;
    warning?: string;
    error: string;
    info?: string;
  };
  border: {
    medium: string;
    light?: string;
    primary?: string;
    heavy?: string; // Tambahkan heavy untuk tema cyber
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
  h1?: { fontSize: number; fontWeight: string; lineHeight: number }; // Tambahkan untuk base.ts
  h2?: { fontSize: number; fontWeight: string; lineHeight: number };
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
  | "sunset-orange";

export interface Theme {
  id: ThemeId;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
  typography?: ThemeTypography;
  spacing?: ThemeSpacing;
  shadows?: ThemeShadows;
}
