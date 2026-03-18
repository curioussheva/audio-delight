// src/constants/themes/types.ts
export interface ThemeColors {
  primary: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    elevated: string;
    overlay: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  border: {
    light: string;
    medium: string;
    heavy: string;
  };
  gradient: {
    start: string;
    end: string;
  };
}

export interface ThemeSpacing {
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

export interface ThemeTypography {
  h1: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  h2: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  h3: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  h4: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  body1: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  body2: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  caption: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
  button: {
    fontSize: number;
    fontWeight: "400" | "500" | "600" | "700";
    lineHeight: number;
  };
}

export interface ThemeShadows {
  sm: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  md: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  lg: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  xl: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  colors: ThemeColors;
  spacing: ThemeSpacing;
  typography: ThemeTypography;
  shadows: ThemeShadows;
}

// ✅ DEFINE ThemeId DI SINI (SATU-SATUNYA)
export type ThemeId =
  | "deep-navy"
  | "midnight-blue"
  | "charcoal-black"
  | "light-gray"
  | "pure-white"
  | "golden-hour"
  | "rose-gold"
  | "forest-green"
  | "ocean-wave"
  | "neon-cyber"
  | "sunset-orange";
