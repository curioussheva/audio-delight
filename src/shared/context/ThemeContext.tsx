// src/shared/contexts/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Theme, ThemeId } from "@/shared/constants/themes/types";
import {
  ALL_THEMES,
  getThemeById,
  getRandomTheme,
  DEFAULT_THEME,
} from "@/shared/constants/theme";
import { resolveToggleTarget } from "@/shared/utils/themeMode";

interface ThemeContextType {
  theme: Theme;
  themeId: ThemeId;
  isDarkMode: boolean;
  setTheme: (themeId: ThemeId) => Promise<void>;
  toggleTheme: () => void;
  randomTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@pristineaudio/theme_id";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme();

  const [themeId, setThemeId] = useState<ThemeId>("emerald-noir");
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
            systemColorScheme === "light" ? "light-elegant" : "emerald-noir";
          setThemeId(defaultId);
          setThemeObj(getThemeById(defaultId));
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
        setThemeId("emerald-noir");
        setThemeObj(DEFAULT_THEME);
      }
    };
    loadTheme();
  }, [systemColorScheme]);

  const setTheme = async (newThemeId: ThemeId) => {
    const safeId = newThemeId in ALL_THEMES ? newThemeId : "emerald-noir";
    setThemeId(safeId);
    setThemeObj(getThemeById(safeId));

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, safeId);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  // Toggle terang <-> gelap untuk tema AKTIF, bukan lompat ke tema tetap.
  //
  // Versi lama hanya mengenal dua dari 20 tema: dari tema apa pun yang gelap ia
  // melempar ke "light-elegant", dan dari yang terang ke "emerald-noir". Jadi
  // memakai toggle saat berada di "rose-gold" membuang pilihan user ke tema
  // yang sama sekali lain. Sekarang ia mencari kandidat dengan mode berlawanan
  // dengan jarak warna terdekat, supaya toggle terasa seperti membalik mode.
  const toggleTheme = () => {
    void setTheme(resolveToggleTarget(themeId));
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
        isDarkMode: theme.isDark,
        setTheme,
        toggleTheme,
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
