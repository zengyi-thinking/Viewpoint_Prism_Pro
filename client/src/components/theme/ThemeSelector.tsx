'use client';

import { useThemeStore } from '@/stores/theme.store';

export function ThemeSelector() {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const themeMode = useThemeStore((state) => state.themeMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-stroke-default bg-surface/80 px-3 text-sm text-text-secondary transition hover:border-stroke-strong hover:text-text-primary"
      aria-label="切换明暗主题"
      title={currentThemeId === 'prism-dark' ? '切换到明色调' : '切换到暗色调'}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)]">
        {themeMode === 'dark' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
          </svg>
        )}
      </span>
      <span className="hidden sm:inline">{themeMode === 'dark' ? '暗色调' : '明色调'}</span>
      <span className="relative h-5 w-9 rounded-full bg-elevated">
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--accent-primary)] transition-transform ${
            themeMode === 'dark' ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
