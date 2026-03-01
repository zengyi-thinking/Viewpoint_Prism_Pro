'use client';

import { useEffect } from 'react';
import { useThemeStore, initTheme } from '@/stores/theme.store';
import { PRESET_THEMES } from '@/types/theme';

/**
 * 主题提供者组件
 *
 * 功能：
 * 1. 初始化主题 CSS 变量
 * 2. 监听主题变化并更新 document
 * 3. 处理系统主题偏好（可选）
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentThemeId, setTheme } = useThemeStore();

  // 初始化主题
  useEffect(() => {
    initTheme(currentThemeId);
  }, [currentThemeId]);

  // 监听系统主题变化（可选功能）
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      // 如果用户使用的是默认主题，可以跟随系统主题
      // 这里暂时禁用自动切换，保留用户显式选择
      // if (currentThemeId === 'vsm-dark' || currentThemeId === 'vsm-light') {
      //   setTheme(e.matches ? 'vsm-dark' : 'vsm-light');
      // }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentThemeId, setTheme]);

  return <>{children}</>;
}

/**
 * 主题脚本组件
 * 在页面渲染前内联执行，防止闪烁
 * 放置在 layout.tsx 的 head 中
 */
export function ThemeScript() {
  const themesScript = PRESET_THEMES.map(
    (theme) => `
  [data-theme="${theme.id}"] {
    --bg-primary: ${theme.colors.background};
    --bg-panel: ${theme.colors.panel};
    --bg-panel-secondary: ${theme.colors.panelSecondary};
    --bg-panel-tertiary: ${theme.colors.panelTertiary};
    --border: ${theme.colors.border};
    --border-subtle: ${theme.colors.borderSubtle};
    --border-focus: ${theme.colors.borderFocus};
    --text-primary: ${theme.colors.textPrimary};
    --text-secondary: ${theme.colors.textSecondary};
    --text-tertiary: ${theme.colors.textTertiary};
    --text-inverse: ${theme.colors.textInverse};
    --accent-primary: ${theme.colors.accent};
    --accent-hover: ${theme.colors.accentHover};
    --accent-muted: ${theme.colors.accentMuted};
    --color-success: ${theme.colors.success};
    --color-warning: ${theme.colors.warning};
    --color-error: ${theme.colors.error};
    --color-info: ${theme.colors.info};
  }`
  ).join('\n');

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var stored = localStorage.getItem('vpp-theme-storage');
              if (stored) {
                var themeId = JSON.parse(stored).state.currentThemeId;
                if (themeId) {
                  document.documentElement.setAttribute('data-theme', themeId);
                }
              }
            } catch (e) {}
          })();
        `,
      }}
    />
  );
}
