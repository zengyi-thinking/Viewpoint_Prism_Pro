import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Theme, getThemeById, themeToCSSVariables } from '@/types/theme';

interface ThemeStore {
  currentThemeId: string;
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
}

/**
 * 主题状态管理 Store
 * 持久化到 localStorage，确保刷新后保持用户选择的主题
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'vsm-dark', // 默认主题
      currentTheme: getThemeById('vsm-dark'),

      setTheme: (themeId: string) => {
        const theme = getThemeById(themeId);
        set({ currentThemeId: themeId, currentTheme: theme });

        // 应用 CSS 变量到 document.documentElement
        const root = document.documentElement;
        const cssVars = themeToCSSVariables(theme);

        // 设置 data-theme 属性
        root.setAttribute('data-theme', themeId);

        // 应用 CSS 变量
        Object.entries(cssVars).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
      },
    }),
    {
      name: 'vpp-theme-storage', // localStorage key
      partialize: (state) => ({ currentThemeId: state.currentThemeId }),
      // 恢复时重新初始化主题
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setTheme(state.currentThemeId);
        }
      },
    }
  )
);

/**
 * 初始化主题（在应用启动时调用）
 * 确保服务端渲染时也能正确应用主题
 */
export function initTheme(themeId?: string) {
  if (typeof window === 'undefined') return;

  const store = useThemeStore.getState();
  const idToApply = themeId || store.currentThemeId;
  store.setTheme(idToApply);
}
