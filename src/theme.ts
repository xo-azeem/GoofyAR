export const colors = {
  bg: '#0A0A0C',
  surface: '#141418',
  surfaceRaised: '#1C1C22',
  border: '#26262E',
  text: '#F4F4F6',
  textMuted: '#8B8B95',
  textDim: '#5C5C66',
  accent: '#C8F55A',
  accentText: '#0A0A0C',
  danger: '#FF5C5C',
  overlay: 'rgba(10,10,12,0.72)',
  glass: 'rgba(20,20,24,0.78)',
  glassBorder: 'rgba(255,255,255,0.08)',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  title: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.6, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4, color: colors.textMuted },
};

/** Deterministic pastel hue per model name so tiles look distinct without thumbnails. */
export function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 58%)`;
}
