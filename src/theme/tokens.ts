// Ported from the fifo-stock-tracker-design-system "Quantum Neon" tokens.
// Dark glassmorphism: navy surfaces, cyan primary, magenta/lime/red accents.
export const color = {
  pageBg: '#0a0e1a',
  cardBg: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(0,240,255,0.17)',
  borderStrong: 'rgba(0,240,255,0.40)',
  navbarBg: 'rgba(10,14,26,0.92)',
  stripe: 'rgba(0,240,255,0.035)',
  hover: 'rgba(0,240,255,0.07)',

  textBody: '#e8ecf4',
  textMuted: '#8a94a6',
  textOnAction: '#0a0e1a',

  actionPrimary: '#00f0ff',
  actionPrimaryActive: '#00c2d1',

  gain: '#39ff14',
  loss: '#ff3b30',
  danger: '#ff2e93',
  warning: '#ffc107',
  success: '#39ff14',

  inputBg: '#10182b',
} as const;

// Bootstrap spacer scale (rem) → px at a 16px base.
export const space = { 1: 4, 2: 8, 3: 16, 4: 24, 5: 48 } as const;

export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;

// Font family names are the exact exports of the @expo-google-fonts packages,
// loaded in src/app/_layout.tsx. Referencing a name that was not loaded makes
// React Native silently fall back to the system font, so these strings and the
// useFonts() map in the root layout must stay in sync.
export const fontFamily = {
  sansRegular: 'SpaceGrotesk_400Regular',
  sansMedium: 'SpaceGrotesk_500Medium',
  sansSemibold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
} as const;

export const font = {
  size: { xs: 12, sm: 14, md: 16, lg: 22, xl: 28, xxl: 40 },
  leadingTight: 1.2,
  leadingNormal: 1.5,
} as const;

/**
 * Allocation-chart series colors, in order. Chosen so no entry reuses
 * `color.gain`/`color.success` (#39ff14), `color.loss` (#ff3b30), or
 * `color.actionPrimary` (#00f0ff) — a chart slice must never share a color
 * with those semantic meanings and imply a relationship that is not there.
 */
export const chartPalette = [
  '#4d7cff', '#ff2e93', '#e9c46a', '#ffc107',
  '#8a6cff', '#ff7a45', '#00d4a0', '#ff5c8a',
] as const;
