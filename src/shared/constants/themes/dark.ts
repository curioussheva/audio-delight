import { Theme } from "./types";
import { BASE_SPACING, BASE_TYPOGRAPHY, BASE_SHADOWS } from "./base";

export const DEEP_NAVY: Theme = {
  id: "deep-navy",
  name: "Deep Navy",
  description: "Elegant dark blue theme",
  isDark: true,
  colors: {
    primary: {
      50: "#E6F0FA",
      100: "#C2D9F0",
      200: "#99BDE0",
      300: "#70A0D0",
      400: "#528AC0",
      500: "#0A2472",
      600: "#082060",
      700: "#061B4D",
      800: "#04163A",
      900: "#020F26",
    },
    background: {
      primary: "#0A1628",
      secondary: "#141E33",
      tertiary: "#1F2A3A",
      elevated: "#2A3440",
      overlay: "rgba(0,0,0,0.5)",
    },
    text: {
      primary: "#F0F4F8",
      secondary: "#C8D4E0",
      tertiary: "#9AA8B9",
      disabled: "#4A5568",
      inverse: "#0A1628",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#2B6EB0",
    },
    border: {
      light: "#2A3440",
      medium: "#1F2A3A",
      heavy: "#141E33",
    },
    // ✅ FIXED: Array format
    gradient: {
      primary: ["#0A2472", "#0A1628"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const MIDNIGHT_BLUE: Theme = {
  id: "midnight-blue",
  name: "Midnight Blue",
  description: "Deep cosmic blue",
  isDark: true,
  colors: {
    primary: {
      50: "#E0E8FF",
      100: "#B8C8FF",
      200: "#8AA8FF",
      300: "#5C88FF",
      400: "#3A6EFF",
      500: "#1B2A4A",
      600: "#16233D",
      700: "#121C30",
      800: "#0D1523",
      900: "#080E17",
    },
    secondary: {
      500: "#8B5CF6",
    },
    background: {
      primary: "#0B1424",
      secondary: "#121C30",
      tertiary: "#1A2540",
      elevated: "#222E4A",
      overlay: "rgba(0,0,0,0.5)",
    },
    text: {
      primary: "#F0F4F8",
      secondary: "#C8D4E0",
      tertiary: "#9AA8B9",
      disabled: "#4A5568",
      inverse: "#0B1424",
    },
    accent: {
      primary: "#F59E0B",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3A6EFF",
    },
    border: {
      light: "#222E4A",
      medium: "#1A2540",
      heavy: "#121C30",
    },
    // ✅ FIXED: Array format
    gradient: {
      primary: ["#1B2A4A", "#0B1424"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const CHARCOAL_BLACK: Theme = {
  id: "charcoal-black",
  name: "Charcoal Black",
  description: "True black for OLED screens",
  isDark: true,
  colors: {
    primary: {
      50: "#E0E0E0",
      100: "#B8B8B8",
      200: "#909090",
      300: "#686868",
      400: "#484848",
      500: "#121212",
      600: "#0E0E0E",
      700: "#0A0A0A",
      800: "#060606",
      900: "#030303",
    },
    secondary: { 500: "#71717A" },
    background: {
      primary: "#000000",
      secondary: "#0A0A0A",
      tertiary: "#121212",
      elevated: "#1A1A1A",
      overlay: "rgba(0,0,0,0.7)",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#E0E0E0",
      tertiary: "#909090",
      disabled: "#404040",
      inverse: "#000000",
    },
    accent: { primary: "#E4E4E7" },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    border: {
      light: "#1A1A1A",
      medium: "#121212",
      heavy: "#0A0A0A",
    },
    // ✅ FIXED: Array format
    gradient: {
      primary: ["#121212", "#000000"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const EMERALD_NOIR: Theme = {
  id: "emerald-noir",
  name: "Emerald Noir",
  description: "Dark elegance with rich emerald and gold accents",
  isDark: true,
  colors: {
    primary: {
      50: "#E6F7EC",
      100: "#C2ECD2",
      200: "#99DFB5",
      300: "#70D298",
      400: "#52C882",
      500: "#059669", // Emerald green from the image text background
      600: "#047A55",
      700: "#035E41",
      800: "#02422E",
      900: "#01261A",
    },
    secondary: {
      500: "#D4AF37", // Gold accent matching the border/shine in image
    },
    background: {
      primary: "#0A0F0C", // Very dark green-black
      secondary: "#0E1511", // Slightly lighter
      tertiary: "#141D17",
      elevated: "#1B2620",
      overlay: "rgba(0, 8, 4, 0.6)",
    },
    text: {
      primary: "#F2F7F4",
      secondary: "#CDDDD4",
      tertiary: "#9BB7AA",
      disabled: "#446654",
      inverse: "#0A0F0C",
    },
    accent: {
      primary: "#D4AF37", // Metallic gold
      secondary: "#B8942E",
    },
    status: {
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#059669",
    },
    border: {
      light: "#1B2620",
      medium: "#141D17",
      heavy: "#0E1511",
    },
    gradient: {
      primary: ["#059669", "#0A0F0C"],
      accent: ["#D4AF37", "#B8942E"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const COZY_METALLIC: Theme = {
  id: "cozy-metallic",
  name: "Cozy Metallic",
  description: "Warm brass and copper tones with dark backdrop",
  isDark: true,
  colors: {
    primary: {
      50: "#FDF4E8",
      100: "#F9E4CC",
      200: "#F2CDA8",
      300: "#E8B07D",
      400: "#DC9455",
      500: "#B87333", // Copper / Bronze
      600: "#9E5F2A",
      700: "#824B21",
      800: "#653818",
      900: "#47260F",
    },
    secondary: {
      500: "#D4A574", // Brass accent
    },
    background: {
      primary: "#1A1410",
      secondary: "#241C16",
      tertiary: "#2F251E",
      elevated: "#3B2E26",
      overlay: "rgba(20, 12, 8, 0.7)",
    },
    text: {
      primary: "#F5EDE4",
      secondary: "#D4C5B8",
      tertiary: "#A89888",
      disabled: "#5C4E44",
      inverse: "#1A1410",
    },
    accent: {
      primary: "#D4A574", // Brass
      secondary: "#E8A87C", // Rose gold accent
    },
    status: {
      success: "#4CAF7C",
      warning: "#E8A435",
      error: "#E85D4A",
      info: "#B87333",
    },
    border: {
      light: "#3B2E26",
      medium: "#2F251E",
      heavy: "#241C16",
    },
    gradient: {
      primary: ["#B87333", "#1A1410"],
      accent: ["#D4A574", "#824B21"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const BLUE_JEANS: Theme = {
  id: "blue-jeans",
  name: "Blue Jeans",
  description: "Classic indigo denim with warm copper stitching",
  isDark: true,
  colors: {
    primary: {
      50: "#E8EEF5",
      100: "#C5D5E8",
      200: "#9DB8D6",
      300: "#759BC4",
      400: "#5782B3",
      500: "#2C4C7E", // Deep indigo
      600: "#243F6A",
      700: "#1C3256",
      800: "#142542",
      900: "#0C182E",
    },
    secondary: {
      500: "#C87A36", // Copper stitching
    },
    background: {
      primary: "#0F1620",
      secondary: "#161F2A",
      tertiary: "#1E2835",
      elevated: "#273240",
      overlay: "rgba(8, 12, 18, 0.7)",
    },
    text: {
      primary: "#EDF2F7",
      secondary: "#C5D0DC",
      tertiary: "#94A3B8",
      disabled: "#4A5A6E",
      inverse: "#0F1620",
    },
    accent: {
      primary: "#C87A36", // Copper
      secondary: "#A8C4E0", // Faded denim
    },
    status: {
      success: "#34A56F",
      warning: "#E8A435",
      error: "#E85D4A",
      info: "#4A7AB5",
    },
    border: {
      light: "#273240",
      medium: "#1E2835",
      heavy: "#161F2A",
    },
    gradient: {
      primary: ["#2C4C7E", "#0F1620"],
      accent: ["#C87A36", "#2C4C7E"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const VINYL_NOIR: Theme = {
  id: "vinyl-noir",
  name: "Vinyl Noir",
  description: "Classic black vinyl with warm amber accents",
  isDark: true,
  colors: {
    primary: {
      50: "#FDF8F0",
      100: "#F9EAD5",
      200: "#F2D8B0",
      300: "#E8C08A",
      400: "#DCAA65",
      500: "#C4883C", // Vintage amber
      600: "#A87030",
      700: "#8C5825",
      800: "#6E421B",
      900: "#4E2C12",
    },
    secondary: {
      500: "#E8D5B0", // Cream label
    },
    background: {
      primary: "#080808", // Deep vinyl black
      secondary: "#121212",
      tertiary: "#1C1C1C",
      elevated: "#262626",
      overlay: "rgba(0, 0, 0, 0.8)",
    },
    text: {
      primary: "#F5F0E8",
      secondary: "#D4CCC0",
      tertiary: "#A89E90",
      disabled: "#5A5248",
      inverse: "#080808",
    },
    accent: {
      primary: "#C4883C", // Amber
      secondary: "#E8D5B0", // Cream
    },
    status: {
      success: "#4A9E6D",
      warning: "#D4A03A",
      error: "#D45A4A",
      info: "#C4883C",
    },
    border: {
      light: "#262626",
      medium: "#1C1C1C",
      heavy: "#121212",
    },
    gradient: {
      primary: ["#1C1C1C", "#080808"],
      accent: ["#C4883C", "#6E421B"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const AGED_WHISKEY: Theme = {
  id: "aged-whiskey",
  name: "Aged Whiskey",
  description: "Rich amber and mahogany tones",
  isDark: true,
  colors: {
    primary: {
      50: "#FDF4E0",
      100: "#F9E4B8",
      200: "#F2D08A",
      300: "#E8B85C",
      400: "#DCA03A",
      500: "#A0522D", // Rich sienna / mahogany
      600: "#8A4223",
      700: "#70331A",
      800: "#562512",
      900: "#3A180A",
    },
    secondary: {
      500: "#D4A060", // Golden amber
    },
    background: {
      primary: "#120C08",
      secondary: "#1A120C",
      tertiary: "#241810",
      elevated: "#2E2016",
      overlay: "rgba(12, 6, 3, 0.7)",
    },
    text: {
      primary: "#F8F0E4",
      secondary: "#DCCCB8",
      tertiary: "#B8A088",
      disabled: "#6A5440",
      inverse: "#120C08",
    },
    accent: {
      primary: "#D4A060",
      secondary: "#C4884A",
    },
    status: {
      success: "#4A8C6D",
      warning: "#D4A040",
      error: "#C85A4A",
      info: "#A0522D",
    },
    border: {
      light: "#2E2016",
      medium: "#241810",
      heavy: "#1A120C",
    },
    gradient: {
      primary: ["#A0522D", "#120C08"],
      accent: ["#D4A060", "#70331A"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const GRAPHITE_SLATE: Theme = {
  id: "graphite-slate",
  name: "Graphite Slate",
  description: "Modern metallic grays with subtle cyan accents",
  isDark: true,
  colors: {
    primary: {
      50: "#E8EEF2",
      100: "#C5D4DE",
      200: "#9DB8C8",
      300: "#759CB2",
      400: "#57849E",
      500: "#3A5C6E", // Slate blue-gray
      600: "#304C5C",
      700: "#263C4A",
      800: "#1C2C38",
      900: "#121C24",
    },
    secondary: {
      500: "#6E9AAC", // Soft cyan accent
    },
    background: {
      primary: "#12181C",
      secondary: "#1A2228",
      tertiary: "#232C34",
      elevated: "#2C3840",
      overlay: "rgba(8, 12, 14, 0.7)",
    },
    text: {
      primary: "#EDF2F5",
      secondary: "#C8D4DC",
      tertiary: "#94A8B4",
      disabled: "#4A5C66",
      inverse: "#12181C",
    },
    accent: {
      primary: "#6E9AAC",
      secondary: "#8AACBC",
    },
    status: {
      success: "#4A9E7A",
      warning: "#C8A040",
      error: "#C86050",
      info: "#5A8AA0",
    },
    border: {
      light: "#2C3840",
      medium: "#232C34",
      heavy: "#1A2228",
    },
    gradient: {
      primary: ["#3A5C6E", "#12181C"],
      accent: ["#6E9AAC", "#263C4A"],
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};
