import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tipe untuk tema
export interface Theme {
  colors: {
    primary: {
      500: string;
    };
    background: {
      primary: string;
      secondary: string;
      tertiary: string;
    };
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
    };
    status: {
      error: string;
      warning: string;
      success: string;
    };
  };
  spacing: {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
  };
  typography: {
    h1: { fontSize: number; fontWeight: string; lineHeight: number };
    h2: { fontSize: number; fontWeight: string; lineHeight: number };
    h3: { fontSize: number; fontWeight: string; lineHeight: number };
    h4: { fontSize: number; fontWeight: string; lineHeight: number };
    body1: { fontSize: number; fontWeight: string; lineHeight: number };
    body2: { fontSize: number; fontWeight: string; lineHeight: number };
    caption: { fontSize: number; fontWeight: string; lineHeight: number };
    button: { fontSize: number; fontWeight: string; lineHeight: number };
  };
}

// Tema Default (Dark Mode)
export const DEFAULT_THEME: Theme = {
  colors: {
    primary: { 500: '#00D4AA' },
    background: {
      primary: '#0A1628',
      secondary: '#141E33',
      tertiary: '#1F2A3A',
    },
    text: {
      primary: '#F0F4F8',
      secondary: '#C8D4E0',
      tertiary: '#9AA8B9',
    },
    status: {
      error: '#EF4444',
      warning: '#F59E0B',
      success: '#10B981',
    },
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  typography: {
    h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
    h2: { fontSize: 28, fontWeight: '700', lineHeight: 36 },
    h3: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
    h4: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
    body1: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    body2: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
    button: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  },
};

// Tema Light Mode (opsional)
export const LIGHT_THEME: Theme = {
  ...DEFAULT_THEME,
  colors: {
    primary: { 500: '#00D4AA' },
    background: {
      primary: '#F0F4F8',
      secondary: '#E0E8F0',
      tertiary: '#C8D4E0',
    },
    text: {
      primary: '#0A1628',
      secondary: '#141E33',
      tertiary: '#1F2A3A',
    },
    status: DEFAULT_THEME.colors.status,
  },
};

interface ThemeContextType {
  theme: Theme;
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [theme, setTheme] = useState<Theme>(isDarkMode ? DEFAULT_THEME : LIGHT_THEME);

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('theme_mode');
        if (saved !== null) {
          setIsDarkMode(saved === 'dark');
          setTheme(saved === 'dark' ? DEFAULT_THEME : LIGHT_THEME);
        } else {
          // Default ke system
          setIsDarkMode(systemColorScheme === 'dark');
          setTheme(systemColorScheme === 'dark' ? DEFAULT_THEME : LIGHT_THEME);
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    setTheme(newMode ? DEFAULT_THEME : LIGHT_THEME);
    await AsyncStorage.setItem('theme_mode', newMode ? 'dark' : 'light');
  };

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    // Optionally save custom theme
  };

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme, setTheme: handleSetTheme }}>
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