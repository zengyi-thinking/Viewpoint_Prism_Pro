'use client';

import { useState, useRef, useEffect } from 'react';
import { useThemeStore } from '@/stores/theme.store';
import { PRESET_THEMES } from '@/types/theme';

/**
 * 主题选择器组件
 * 齿轮图标 + 下拉菜单，类似 VS Code 的主题切换
 */
export function ThemeSelector() {
  const { currentThemeId, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentTheme = PRESET_THEMES.find(t => t.id === currentThemeId) || PRESET_THEMES[0];

  return (
    <div ref={containerRef} className="relative">
      {/* 太阳图标按钮（主题切换） */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-all hover:bg-bg-panel-secondary hover:text-text-primary"
        title="切换主题"
      >
        {currentTheme.type === 'light' ? (
          // 月亮图标（当前是浅色主题，点击可切换到深色）
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          // 太阳图标（当前是深色主题，点击可切换到浅色）
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="dropdown-menu absolute right-0 top-full z-50 mt-2 w-72">
          <div className="p-3 border-b border-border-subtle">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              主题设置
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {/* 深色主题组 */}
            <div className="mb-4">
              <p className="mb-2 px-2 text-xs font-medium text-text-tertiary">
                深色主题
              </p>
              <div className="space-y-1">
                {PRESET_THEMES.filter(t => t.type === 'dark').map(theme => (
                  <ThemeOption
                    key={theme.id}
                    theme={theme}
                    isActive={currentThemeId === theme.id}
                    onClick={() => {
                      setTheme(theme.id);
                      setIsOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* 浅色主题组 */}
            <div>
              <p className="mb-2 px-2 text-xs font-medium text-text-tertiary">
                浅色主题
              </p>
              <div className="space-y-1">
                {PRESET_THEMES.filter(t => t.type === 'light').map(theme => (
                  <ThemeOption
                    key={theme.id}
                    theme={theme}
                    isActive={currentThemeId === theme.id}
                    onClick={() => {
                      setTheme(theme.id);
                      setIsOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 底部提示 */}
          <div className="border-t border-border-subtle p-2">
            <p className="px-2 text-[10px] text-text-tertiary">
              主题选择会自动保存到本地
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ThemeOptionProps {
  theme: {
    id: string;
    name: string;
    nameEn: string;
    colors: {
      background: string;
      panel: string;
      accent: string;
    };
  };
  isActive: boolean;
  onClick: () => void;
}

/**
 * 单个主题选项
 */
function ThemeOption({ theme, isActive, onClick }: ThemeOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`dropdown-item w-full rounded-lg ${
        isActive ? 'dropdown-item-active' : ''
      }`}
    >
      {/* 主题预览色块 */}
      <div className="flex shrink-0 items-center gap-1">
        <div
          className="h-5 w-5 rounded border border-border-subtle"
          style={{ backgroundColor: theme.colors.background }}
        />
        <div
          className="h-5 w-5 rounded border border-border-subtle"
          style={{ backgroundColor: theme.colors.panel }}
        />
        <div
          className="h-5 w-5 rounded border border-border-subtle"
          style={{ backgroundColor: theme.colors.accent }}
        />
      </div>

      {/* 主题名称 */}
      <div className="flex-1 text-left">
        <p className="text-sm font-medium">{theme.name}</p>
        <p className="text-[10px] opacity-70">{theme.nameEn}</p>
      </div>

      {/* 选中标记 */}
      {isActive && (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
