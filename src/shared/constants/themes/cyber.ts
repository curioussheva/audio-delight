import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY } from "./base";

export const NEON_CYBER: Theme = {
  id: "neon-cyber",
  name: "Neon Cyber",
  description: "Vibrant cyberpunk theme",
  isDark: true,
  colors: {
    primary: {
      50: "#FCE4FF",
      100: "#F8B8FF",
      200: "#F48CFF",
      300: "#F060FF",
      400: "#EC34FF",
      500: "#00F0FF", // Cyan neon
      600: "#00CCFF",
      700: "#00A8FF",
      800: "#0084FF",
      900: "#0060FF",
    },
    background: {
      primary: "#0D0B1A",
      secondary: "#1A1730",
      tertiary: "#272346",
      elevated: "#342F5C",
      overlay: "rgba(0,0,0,0.7)",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#00F0FF",
      tertiary: "#FF00FF",
      disabled: "#4A4A6A",
      inverse: "#0D0B1A",
    },
    status: {
      success: "#00FF00",
      warning: "#FFFF00",
      error: "#FF00FF",
      info: "#00FFFF",
    },
    border: {
      light: "#00F0FF",
      medium: "#FF00FF",
      heavy: "#FFFF00",
    },
    gradient: {
      start: "#00F0FF",
      end: "#FF00FF",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any,
};

export const SUNSET_ORANGE: Theme = {
  id: "sunset-orange",
  name: "Sunset Orange",
  description: "Warm sunset vibes",
  isDark: true,
  colors: {
    primary: {
      50: "#FFF3E0",
      100: "#FFE0B2",
      200: "#FFCC80",
      300: "#FFB74D",
      400: "#FFA726",
      500: "#FF6B35", // Sunset orange
      600: "#F4511E",
      700: "#E64A19",
      800: "#D84315",
      900: "#BF360C",
    },
    background: {
      primary: "#1A0F0A",
      secondary: "#2A1A12",
      tertiary: "#3A251A",
      elevated: "#4A3022",
      overlay: "rgba(0,0,0,0.5)",
    },
    text: {
      primary: "#FFF9F0",
      secondary: "#FFE4CA",
      tertiary: "#FFCFA5",
      disabled: "#8B6F5A",
      inverse: "#1A0F0A",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#4A3022",
      medium: "#3A251A",
      heavy: "#2A1A12",
    },
    gradient: {
      start: "#FF6B35",
      end: "#1A0F0A",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any,
};
