import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY } from "./base";

export const FOREST_GREEN: Theme = {
  id: "forest-green",
  name: "Forest Green",
  description: "Calming forest theme",
  isDark: true,
  colors: {
    primary: {
      50: "#E8F5E9",
      100: "#C8E6C9",
      200: "#A5D6A7",
      300: "#81C784",
      400: "#66BB6A",
      500: "#2D5A27", // Forest green
      600: "#1E4A1A",
      700: "#153A12",
      800: "#0C2A0A",
      900: "#041A03",
    },
    background: {
      primary: "#0F1F0D",
      secondary: "#1A2F17",
      tertiary: "#253F21",
      elevated: "#304F2B",
      overlay: "rgba(0,0,0,0.5)",
    },
    text: {
      primary: "#F0F7EF",
      secondary: "#D1E6CD",
      tertiary: "#B2D5AB",
      disabled: "#5A7853",
      inverse: "#0F1F0D",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#304F2B",
      medium: "#253F21",
      heavy: "#1A2F17",
    },
    gradient: {
      start: "#2D5A27",
      end: "#0F1F0D",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any,
};

export const OCEAN_WAVE: Theme = {
  id: "ocean-wave",
  name: "Ocean Wave",
  description: "Deep sea blues",
  isDark: true,
  colors: {
    primary: {
      50: "#E3F2FD",
      100: "#BBDEFB",
      200: "#90CAF9",
      300: "#64B5F6",
      400: "#42A5F5",
      500: "#1A4B77", // Ocean blue
      600: "#143B5E",
      700: "#0E2B45",
      800: "#081C2C",
      900: "#020C14",
    },
    background: {
      primary: "#0B1E2B",
      secondary: "#122F40",
      tertiary: "#194055",
      elevated: "#20516A",
      overlay: "rgba(0,0,0,0.5)",
    },
    text: {
      primary: "#E6F3FF",
      secondary: "#B8DAFF",
      tertiary: "#8AC1FF",
      disabled: "#456980",
      inverse: "#0B1E2B",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#20516A",
      medium: "#194055",
      heavy: "#122F40",
    },
    gradient: {
      start: "#1A4B77",
      end: "#0B1E2B",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any,
};
