// src/constants/theme.ts
export const COLORS = {
  // Primary - Hijau Audiophile (Premium, Teknologi)
  primary: {
    50: '#E6F7F0',
    100: '#C2EBD9',
    200: '#99DEC0',
    300: '#70D0A7',
    400: '#52C594',
    500: '#00D4AA', // Primary brand color
    600: '#00BFA0',
    700: '#00A88F',
    800: '#00917E',
    900: '#006B5C',
  },
  
  // Dark Mode Base
  background: {
    primary: '#0A1628',   // Deep navy
    secondary: '#141E33',  // Slightly lighter
    tertiary: '#1F2A3A',   // Card background
    elevated: '#2A3440',   // Modal/Drawer
  },
  
  // Text
  text: {
    primary: '#F0F4F8',    // Almost white
    secondary: '#C8D4E0',   // Light gray
    tertiary: '#9AA8B9',    // Medium gray
    disabled: '#4A5568',    // Dark gray
  },
  
  // Accent
  accent: {
    blue: '#2B6EB0',
    purple: '#8B5CF6',
    orange: '#F59E0B',
    red: '#EF4444',
    green: '#10B981',
  },
  
  // Status
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#2B6EB0',
  },
  
  // Gradients
  gradients: {
    player: ['#0A1628', '#141E33'],
    equalizer: ['#00D4AA', '#2B6EB0'],
    visualizer: ['#00D4AA', '#8B5CF6'],
  },
} as const;

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
  },
  h3: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  h4: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  body1: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  body2: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;