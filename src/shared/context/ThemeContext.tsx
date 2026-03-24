import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Theme, ThemeId } from "@/constants/themes/types";
import {
  DEFAULT_THEME,
  getThemeById,
  getRandomTheme,
  THEMES_LIST,
  ALL_THEMES,
} from "@/constants/themes";

interface ThemeContextType {
  theme: Theme;
  themeId: ThemeId;
  availableThemes: typeof THEMES_LIST;
  isDarkMode: boolean;
  setTheme: (themeId: ThemeId) => Promise<void>;
  toggleTheme: () => void;
  nextTheme: () => void;
  randomTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@pristineaudio/theme_id";

const FALLBACK_DARK: ThemeId = "deep-navy";
const FALLBACK_LIGHT: ThemeId = "light-gray";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme();
  const [themeId, setThemeId] = useState<ThemeId>(FALLBACK_DARK);
  const [theme, setThemeObj] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;

        if (saved && saved in ALL_THEMES) {
          setThemeId(saved);
          setThemeObj(getThemeById(saved));
        } else {
          const defaultId = systemColorScheme === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT;
          setThemeId(defaultId);
          setThemeObj(getThemeById(defaultId));
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (newThemeId: ThemeId) => {
    const safeId = newThemeId in ALL_THEMES ? newThemeId : FALLBACK_DARK;
    if (safeId !== newThemeId) {
      console.warn(`Theme "${newThemeId}" not found, falling back to default`);
    }
    setThemeId(safeId);
    setThemeObj(getThemeById(safeId));
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, safeId);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  const toggleTheme = () => {
    setTheme(theme.isDark ? FALLBACK_LIGHT : FALLBACK_DARK);
  };

  const nextTheme = () => {
    const currentIndex = THEMES_LIST.findIndex((t) => t.id === themeId);
    const next = THEMES_LIST[(currentIndex + 1) % THEMES_LIST.length];
    setTheme(next.id as ThemeId);
  };

  const randomTheme = async () => {
    await setTheme(getRandomTheme().id as ThemeId);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeId,
        availableThemes: THEMES_LIST,
        isDarkMode: theme.isDark,
        setTheme,
        toggleTheme,
        nextTheme,
        randomTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};