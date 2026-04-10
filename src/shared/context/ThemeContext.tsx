// src/shared/contexts/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Theme, ThemeId } from "@/shared/constants/themes/types";
import {
  ALL_THEMES,
  getThemeById,
  getRandomTheme,
  THEMES_LIST,
  DEFAULT_THEME,
} from "@/shared/constants/theme";

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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme();

  const [themeId, setThemeId] = useState<ThemeId>("obsidian");
  const [theme, setThemeObj] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = (await AsyncStorage.getItem(
          THEME_STORAGE_KEY,
        )) as ThemeId | null;

        if (saved && saved in ALL_THEMES) {
          setThemeId(saved);
          setThemeObj(getThemeById(saved));
        } else {
          const defaultId: ThemeId =
            systemColorScheme === "light" ? "light-elegant" : "obsidian";
          setThemeId(defaultId);
          setThemeObj(getThemeById(defaultId));
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
        setThemeId("obsidian");
        setThemeObj(DEFAULT_THEME);
      }
    };
    loadTheme();
  }, [systemColorScheme]);

  const setTheme = async (newThemeId: ThemeId) => {
    const safeId = newThemeId in ALL_THEMES ? newThemeId : "obsidian";
    setThemeId(safeId);
    setThemeObj(getThemeById(safeId));

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, safeId);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  const toggleTheme = () => {
    const newId: ThemeId = theme.isDark ? "light-elegant" : "obsidian";
    setTheme(newId);
  };

  const nextTheme = () => {
    const currentIndex = THEMES_LIST.findIndex((t) => t.id === themeId);
    const nextIndex = (currentIndex + 1) % THEMES_LIST.length;
    setTheme(THEMES_LIST[nextIndex].id as ThemeId);
  };

  const randomTheme = async () => {
    const random = getRandomTheme();
    await setTheme(random.id as ThemeId);
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
