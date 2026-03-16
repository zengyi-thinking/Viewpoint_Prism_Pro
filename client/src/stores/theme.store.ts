import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID, type ThemeDefinition, type ThemeId, getThemeById, themeToCSSVariables } from '@/types/theme';

interface ThemeStore {
  currentThemeId: ThemeId;
  currentTheme: ThemeDefinition;
  themeMode: ThemeDefinition['mode'];
  setTheme: (themeId: ThemeId) => void;
  toggleTheme: () => void;
}

function applyTheme(themeId: ThemeId) {
  if (typeof document === 'undefined') return;
  const theme = getThemeById(themeId);
  const root = document.documentElement;

  root.setAttribute('data-theme', theme.id);
  Object.entries(themeToCSSVariables(theme)).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: DEFAULT_THEME_ID,
      currentTheme: getThemeById(DEFAULT_THEME_ID),
      themeMode: getThemeById(DEFAULT_THEME_ID).mode,
      setTheme: (themeId) => {
        const nextTheme = getThemeById(themeId);
        set({
          currentThemeId: nextTheme.id,
          currentTheme: nextTheme,
          themeMode: nextTheme.mode,
        });
        applyTheme(nextTheme.id);
      },
      toggleTheme: () => {
        const nextThemeId: ThemeId = get().currentThemeId === 'prism-dark' ? 'prism-light' : 'prism-dark';
        get().setTheme(nextThemeId);
      },
    }),
    {
      name: 'vpp-theme-storage',
      partialize: (state) => ({ currentThemeId: state.currentThemeId }),
      onRehydrateStorage: () => (state) => {
        const restoredThemeId = state?.currentThemeId || DEFAULT_THEME_ID;
        state?.setTheme(restoredThemeId);
      },
    },
  ),
);

export function initTheme(themeId?: ThemeId) {
  if (typeof window === 'undefined') return;
  applyTheme(themeId || useThemeStore.getState().currentThemeId || DEFAULT_THEME_ID);
}
