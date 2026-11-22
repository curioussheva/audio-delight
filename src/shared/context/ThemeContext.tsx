// src/shared/contexts/ThemeContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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

  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME.id);
  const [theme, setThemeObj] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = (await AsyncStorage.getItem(
          THEME_STORAGE_KEY,
        )) as ThemeId | null;

        if (saved && saved in ALL_THEMES) {
          // Pilihan tersimpan TIDAK PERNAH ditimpa oleh default baru
          // (Fase 1 redesign): user lama tetap di temanya sendiri.
          setThemeId(saved);
          setThemeObj(getThemeById(saved));
        } else {
          // Instalasi baru (atau simpanan rusak): default = pasangan
          // hangat (Fase 1) mengikuti mode sistem — ember gelap,
          // hearth terang.
          const defaultId: ThemeId =
            systemColorScheme === "light"
              ? "pristine-hearth"
              : "pristine-ember";
          setThemeId(defaultId);
          setThemeObj(getThemeById(defaultId));
        }
      } catch (error) {
        console.error("Failed to load theme:", error);
        setThemeId(DEFAULT_THEME.id);
        setThemeObj(DEFAULT_THEME);
      }
    };
    loadTheme();
  }, [systemColorScheme]);

  // Per-node render (2026-11-22): aksi dibungkus useCallback + value
  // provider di-useMemo — dulu `value={{...}}` objek BARU tiap render
  // ThemeProvider, jadi tiap render RootLayout (fase boot) membangunkan
  // SEMUA pemakai useTheme di seluruh app walau temanya tidak berubah.
  const setTheme = useCallback(async (newThemeId: ThemeId) => {
    const safeId =
      newThemeId in ALL_THEMES ? newThemeId : DEFAULT_THEME.id;
    setThemeId(safeId);
    setThemeObj(getThemeById(safeId));

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, safeId);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  }, []);

  // Toggle terang <-> gelap untuk tema AKTIF, bukan lompat ke tema tetap.
  //
  // Versi lama hanya mengenal dua dari 20 tema: dari tema apa pun yang gelap ia
  // melempar ke "light-elegant", dan dari yang terang ke "emerald-noir". Jadi
  // memakai toggle saat berada di "rose-gold" membuang pilihan user ke tema
  // yang sama sekali lain. Sekarang ia mencari kandidat dengan mode berlawanan
  // dengan jarak warna terdekat, supaya toggle terasa seperti membalik mode.
  const toggleTheme = useCallback(() => {
    void setTheme(resolveToggleTarget(themeId));
  }, [setTheme, themeId]);

  const randomTheme = useCallback(async () => {
    // U-P2-35: tema aktif dikecualikan supaya acak selalu terasa berganti.
    const random = getRandomTheme(themeId);
    await setTheme(random.id as ThemeId);
  }, [setTheme, themeId]);

  const contextValue = useMemo(
    () => ({
      theme,
      themeId,
      isDarkMode: theme.isDark,
      setTheme,
      toggleTheme,
      randomTheme,
    }),
    [theme, themeId, setTheme, toggleTheme, randomTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
