export const Colors = {
  // Background layers
  bg: '#080a0f',
  surface: '#0d1018',
  card: '#111520',
  cardHover: '#161c2a',

  // Borders
  border: 'rgba(99,120,255,0.12)',
  borderStrong: 'rgba(99,120,255,0.28)',

  // Accent
  accent: '#6378ff',
  accentDim: 'rgba(99,120,255,0.2)',
  accentGlow: 'rgba(99,120,255,0.35)',
  accent2: '#ff6b9d',
  accent2Dim: 'rgba(255,107,157,0.2)',
  accent3: '#00e5c0',

  // Text
  text: '#e8eaf6',
  textMuted: '#5a6080',
  textDim: '#3a4060',

  // Status
  success: '#00c896',
  warning: '#ffb84d',
  error: '#ff5f7a',

  // Gradients (use in LinearGradient)
  gradientPlayer: ['#0d1018', '#080a0f'],
  gradientAccent: ['#6378ff', '#ff6b9d'],
  gradientAccentReverse: ['#ff6b9d', '#6378ff'],
  gradientGreen: ['#00e5c0', '#6378ff'],
} as const;

export type ColorKey = keyof typeof Colors;
