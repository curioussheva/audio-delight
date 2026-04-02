import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY } from "./base";

export const LIGHT_GRAY: Theme = {
  id: "light-gray",
  name: "Light Gray",
  description: "Clean light theme",
  isDark: false,
  colors: {
    primary: {
      50: "#E6F0FA",
      100: "#C2D9F0",
      200: "#99BDE0",
      300: "#70A0D0",
      400: "#528AC0",
      500: "#3A6EA5", // Soft blue
      600: "#2E5785",
      700: "#234065",
      800: "#172A45",
      900: "#0C1A2D",
    },
    secondary: { 500: "#7C3AED" },
    background: {
      primary: "#F8FAFC",
      secondary: "#F1F5F9",
      tertiary: "#E2E8F0",
      elevated: "#FFFFFF",
      overlay: "rgba(0,0,0,0.1)",
    },
    text: {
      primary: "#0F172A",
      secondary: "#334155",
      tertiary: "#64748B",
      disabled: "#94A3B8",
      inverse: "#FFFFFF",
    },
    accent: { primary: "#F59E0B" },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#E2E8F0",
      medium: "#CBD5E1",
      heavy: "#94A3B8",
    },
    gradient: {
      start: "#F8FAFC",
      end: "#E2E8F0",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 4,
    },
    xl: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 6,
    },
  },
};

export const PURE_WHITE: Theme = {
  id: "pure-white",
  name: "Pure White",
  description: "Minimalist white theme",
  isDark: false,
  colors: {
    primary: {
      50: "#E8F0FE",
      100: "#D9E6FF",
      200: "#B8D1FF",
      300: "#97BCFF",
      400: "#76A7FF",
      500: "#2563EB", // Bright blue
      600: "#1D4ED8",
      700: "#1E40AF",
      800: "#1E3A8A",
      900: "#172554",
    },
    secondary: { 500: "#7C3AED" },
    background: {
      primary: "#FFFFFF",
      secondary: "#FAFAFA",
      tertiary: "#F5F5F5",
      elevated: "#FFFFFF",
      overlay: "rgba(0,0,0,0.05)",
    },
    text: {
      primary: "#171717",
      secondary: "#404040",
      tertiary: "#737373",
      disabled: "#A3A3A3",
      inverse: "#FFFFFF",
    },
    accent: { primary: "#EAB308" },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#E5E5E5",
      medium: "#D4D4D4",
      heavy: "#A3A3A3",
    },
    gradient: {
      start: "#FFFFFF",
      end: "#F5F5F5",
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: LIGHT_GRAY.shadows,
};
