'use client';

import { useEffect } from 'react';
import { DEFAULT_THEME_ID } from '@/types/theme';
import { initTheme, useThemeStore } from '@/stores/theme.store';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);

  useEffect(() => {
    initTheme(currentThemeId);
  }, [currentThemeId]);

  return <>{children}</>;
}

export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var stored = localStorage.getItem('vpp-theme-storage');
              var themeId = '${DEFAULT_THEME_ID}';
              if (stored) {
                var parsed = JSON.parse(stored);
                if (parsed && parsed.state && parsed.state.currentThemeId) {
                  themeId = parsed.state.currentThemeId;
                }
              }
              document.documentElement.setAttribute('data-theme', themeId);
            } catch (error) {
              document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME_ID}');
            }
          })();
        `,
      }}
    />
  );
}
