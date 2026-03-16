import { Theme } from './types';
import { BASE_SPACING, BASE_TYPOGRAPHY, BASE_SHADOWS } from './base';

export const DEEP_NAVY: Theme = {
  id: 'deep-navy',
  name: 'Deep Navy',
  description: 'Elegant dark blue theme',
  isDark: true,
  colors: {
    primary: {
      50: '#E6F0FA',
      100: '#C2D9F0',
      200: '#99BDE0',
      300: '#70A0D0',
      400: '#528AC0',
      500: '#0A2472', // Navy utama
      600: '#082060',
      700: '#061B4D',
      800: '#04163A',
      900: '#020F26',
    },
    background: {
      primary: '#0A1628',
      secondary: '#141E33',
      tertiary: '#1F2A3A',
      elevated: '#2A3440',
      overlay: 'rgba(0,0,0,0.5)',
    },
    text: {
      primary: '#F0F4F8',
      secondary: '#C8D4E0',
      tertiary: '#9AA8B9',
      disabled: '#4A5568',
      inverse: '#0A1628',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#2B6EB0',
    },
    border: {
      light: '#2A3440',
      medium: '#1F2A3A',
      heavy: '#141E33',
    },
    gradient: {
      start: '#0A2472',
      end: '#0A1628',
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const MIDNIGHT_BLUE: Theme = {
  id: 'midnight-blue',
  name: 'Midnight Blue',
  description: 'Deep cosmic blue',
  isDark: true,
  colors: {
    primary: {
      50: '#E0E8FF',
      100: '#B8C8FF',
      200: '#8AA8FF',
      300: '#5C88FF',
      400: '#3A6EFF',
      500: '#1B2A4A', // Midnight blue
      600: '#16233D',
      700: '#121C30',
      800: '#0D1523',
      900: '#080E17',
    },
    background: {
      primary: '#0B1424',
      secondary: '#121C30',
      tertiary: '#1A2540',
      elevated: '#222E4A',
      overlay: 'rgba(0,0,0,0.5)',
    },
    text: {
      primary: '#F0F4F8',
      secondary: '#C8D4E0',
      tertiary: '#9AA8B9',
      disabled: '#4A5568',
      inverse: '#0B1424',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3A6EFF',
    },
    border: {
      light: '#222E4A',
      medium: '#1A2540',
      heavy: '#121C30',
    },
    gradient: {
      start: '#1B2A4A',
      end: '#0B1424',
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};

export const CHARCOAL_BLACK: Theme = {
  id: 'charcoal-black',
  name: 'Charcoal Black',
  description: 'True black for OLED screens',
  isDark: true,
  colors: {
    primary: {
      50: '#E0E0E0',
      100: '#B8B8B8',
      200: '#909090',
      300: '#686868',
      400: '#484848',
      500: '#121212', // True black
      600: '#0E0E0E',
      700: '#0A0A0A',
      800: '#060606',
      900: '#030303',
    },
    background: {
      primary: '#000000',
      secondary: '#0A0A0A',
      tertiary: '#121212',
      elevated: '#1A1A1A',
      overlay: 'rgba(0,0,0,0.7)',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#E0E0E0',
      tertiary: '#909090',
      disabled: '#404040',
      inverse: '#000000',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    border: {
      light: '#1A1A1A',
      medium: '#121212',
      heavy: '#0A0A0A',
    },
    gradient: {
      start: '#121212',
      end: '#000000',
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SHADOWS,
};