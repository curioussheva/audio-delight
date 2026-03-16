import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, ThemeId } from '@/constants/themes/types';  // ← IMPOR DARI TYPES
import { DEFAULT_THEME, getThemeById, THEMES_LIST, ALL_THEMES } from '@/constants/themes';

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

const THEME_STORAGE_KEY = '@pristineaudio/theme_id';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeId, setThemeId] = useState<ThemeId>('deep-navy');
  const [theme, setThemeObj] = useState<Theme>(DEFAULT_THEME);

  // Load saved theme
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
        
        // ✅ CEK APAKAH saved VALID
        if (saved && saved in ALL_THEMES) {
          setThemeId(saved);
          setThemeObj(getThemeById(saved));
        } else {
          // Default ke system preference
          // Gunakan type assertion yang aman
          const defaultTheme = systemColorScheme === 'dark' ? 'deep-navy' as ThemeId : 'light-gray' as ThemeId;
          setThemeId(defaultTheme);
          setThemeObj(getThemeById(defaultTheme));
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (newThemeId: ThemeId) => {
    try {
      // ✅ VALIDASI newThemeId
      if (!(newThemeId in ALL_THEMES)) {
        console.warn(`Theme ${newThemeId} not found, using default`);
        newThemeId = 'deep-navy';
      }
      
      const newTheme = getThemeById(newThemeId);
      setThemeId(newThemeId);
      setThemeObj(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newThemeId);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const toggleTheme = () => {
    // Switch antara dark dan light mode
    const isDark = theme.isDark;
    const newThemeId: ThemeId = isDark ? 'light-gray' : 'deep-navy';
    setTheme(newThemeId);
  };

  const nextTheme = () => {
    const currentIndex = THEMES_LIST.findIndex(t => t.id === themeId);
    const nextIndex = (currentIndex + 1) % THEMES_LIST.length;
    setTheme(THEMES_LIST[nextIndex].id as ThemeId);
  };

  const randomTheme = async () => {
    const randomIndex = Math.floor(Math.random() * THEMES_LIST.length);
    await setTheme(THEMES_LIST[randomIndex].id as ThemeId);
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      themeId,
      availableThemes: THEMES_LIST,
      isDarkMode: theme.isDark,
      setTheme,
      toggleTheme,
      nextTheme,
      randomTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};