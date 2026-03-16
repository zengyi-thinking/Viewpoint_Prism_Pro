export type ThemeId = 'prism-dark' | 'prism-light';
export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
  base: string;
  surface: string;
  surfaceAlt: string;
  elevated: string;
  stroke: string;
  strokeStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentStrong: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  glowOrange: string;
  glowPink: string;
  glowIndigo: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  mode: ThemeMode;
  palette: ThemePalette;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'prism-dark': {
    id: 'prism-dark',
    name: 'Prism Dark',
    mode: 'dark',
    palette: {
      base: '#0a0b10',
      surface: '#11131a',
      surfaceAlt: '#161924',
      elevated: '#1d2230',
      stroke: 'rgba(255,255,255,0.08)',
      strokeStrong: 'rgba(255,255,255,0.14)',
      textPrimary: '#f5f7fb',
      textSecondary: 'rgba(235,241,255,0.78)',
      textMuted: 'rgba(210,219,240,0.5)',
      textInverse: '#0a0b10',
      accent: '#ff4d8d',
      accentHover: '#ff6ba2',
      accentSoft: 'rgba(255,77,141,0.14)',
      accentStrong: '#ff7a45',
      success: '#33c38e',
      warning: '#ffb24b',
      error: '#ff6b7a',
      info: '#4ba8ff',
      glowOrange: 'rgba(255,122,69,0.28)',
      glowPink: 'rgba(255,77,141,0.2)',
      glowIndigo: 'rgba(93,102,255,0.2)',
    },
  },
  'prism-light': {
    id: 'prism-light',
    name: 'Prism Light',
    mode: 'light',
    palette: {
      base: '#f5f1eb',
      surface: 'rgba(255,255,255,0.82)',
      surfaceAlt: '#fcfaf7',
      elevated: '#efe7dc',
      stroke: 'rgba(61,46,33,0.1)',
      strokeStrong: 'rgba(61,46,33,0.16)',
      textPrimary: '#1d1a17',
      textSecondary: 'rgba(37,31,25,0.72)',
      textMuted: 'rgba(61,46,33,0.48)',
      textInverse: '#ffffff',
      accent: '#d93f77',
      accentHover: '#b53162',
      accentSoft: 'rgba(217,63,119,0.1)',
      accentStrong: '#ef7d46',
      success: '#1f9b6b',
      warning: '#c48426',
      error: '#cf4d5d',
      info: '#2e7bd9',
      glowOrange: 'rgba(239,125,70,0.18)',
      glowPink: 'rgba(217,63,119,0.14)',
      glowIndigo: 'rgba(93,102,255,0.12)',
    },
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'prism-dark';

export function getThemeById(themeId: string | undefined): ThemeDefinition {
  if (themeId && themeId in THEMES) {
    return THEMES[themeId as ThemeId];
  }
  return THEMES[DEFAULT_THEME_ID];
}

export function themeToCSSVariables(theme: ThemeDefinition): Record<string, string> {
  const { palette, mode } = theme;

  return {
    '--bg-base': palette.base,
    '--bg-surface': palette.surface,
    '--bg-surface-alt': palette.surfaceAlt,
    '--bg-elevated': palette.elevated,
    '--stroke-default': palette.stroke,
    '--stroke-strong': palette.strokeStrong,
    '--text-primary': palette.textPrimary,
    '--text-secondary': palette.textSecondary,
    '--text-muted': palette.textMuted,
    '--text-inverse': palette.textInverse,
    '--accent-primary': palette.accent,
    '--accent-hover': palette.accentHover,
    '--accent-soft': palette.accentSoft,
    '--accent-strong': palette.accentStrong,
    '--signal-success': palette.success,
    '--signal-warning': palette.warning,
    '--signal-error': palette.error,
    '--signal-info': palette.info,
    '--glow-orange': palette.glowOrange,
    '--glow-pink': palette.glowPink,
    '--glow-indigo': palette.glowIndigo,
    '--theme-mode': mode,
    '--bg-primary': palette.base,
    '--bg-panel': palette.surface,
    '--bg-panel-secondary': palette.surfaceAlt,
    '--bg-panel-tertiary': palette.elevated,
    '--border': palette.stroke,
    '--border-subtle': palette.stroke,
    '--border-focus': palette.accent,
    '--text-tertiary': palette.textMuted,
    '--accent-muted': palette.accentSoft,
    '--color-success': palette.success,
    '--color-warning': palette.warning,
    '--color-error': palette.error,
    '--color-info': palette.info,
  };
}
