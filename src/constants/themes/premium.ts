import { Theme } from './types';
import { BASE_SPACING, BASE_TYPOGRAPHY } from './base';

export const GOLDEN_HOUR: Theme = {
  id: 'golden-hour',
  name: 'Golden Hour',
  description: 'Warm gold tones',
  isDark: true,
  colors: {
    primary: {
      50: '#FEF3E7',
      100: '#FDE0C3',
      200: '#FCCD9F',
      300: '#FBBA7B',
      400: '#FAA757',
      500: '#D4A373', // Gold
      600: '#B8864F',
      700: '#9C6B3D',
      800: '#80502B',
      900: '#643519',
    },
    background: {
      primary: '#1A1410',
      secondary: '#2A201A',
      tertiary: '#3A2C24',
      elevated: '#4A382E',
      overlay: 'rgba(0,0,0,0.5)',
    },
    text: {
      primary: '#FDF8F2',
      secondary: '#F5E6D3',
      tertiary: '#E5D1B8',
      disabled: '#8B7A6A',
      inverse: '#1A1410',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    border: {
      light: '#4A382E',
      medium: '#3A2C24',
      heavy: '#2A201A',
    },
    gradient: {
      start: '#D4A373',
      end: '#1A1410',
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any, // reuse
};

export const ROSE_GOLD: Theme = {
  id: 'rose-gold',
  name: 'Rose Gold',
  description: 'Elegant pink gold',
  isDark: true,
  colors: {
    primary: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#E6B0B0', // Rose gold base
      600: '#D48C8C',
      700: '#C26868',
      800: '#B04444',
      900: '#9E2020',
    },
    background: {
      primary: '#1F1A1A',
      secondary: '#2F2424',
      tertiary: '#3F2E2E',
      elevated: '#4F3838',
      overlay: 'rgba(0,0,0,0.5)',
    },
    text: {
      primary: '#FDF2F2',
      secondary: '#F5D6D6',
      tertiary: '#E5B8B8',
      disabled: '#8B6A6A',
      inverse: '#1F1A1A',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    border: {
      light: '#4F3838',
      medium: '#3F2E2E',
      heavy: '#2F2424',
    },
    gradient: {
      start: '#E6B0B0',
      end: '#1F1A1A',
    },
  },
  spacing: BASE_SPACING,
  typography: BASE_TYPOGRAPHY,
  shadows: BASE_SPACING as any,
};