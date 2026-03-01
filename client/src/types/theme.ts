/**
 * 主题类型定义
 * 支持 VS Code 风格的多主题切换系统
 */

export type ThemeType = 'dark' | 'light' | 'high-contrast';

/**
 * 主题颜色配置
 */
export interface ThemeColors {
  // 背景色
  background: string;      // 主背景
  panel: string;           // 面板/卡片背景
  panelSecondary: string;  // 次级面板
  panelTertiary: string;   // 悬浮/高亮面板

  // 边框色
  border: string;          // 主边框
  borderSubtle: string;    // 次级边框
  borderFocus: string;     // 聚焦边框

  // 文字色
  textPrimary: string;     // 主要文字
  textSecondary: string;   // 次要文字
  textTertiary: string;    // 占位/禁用文字
  textInverse: string;     // 反色文字（用于深色背景上的浅色文字）

  // 强调色
  accent: string;          // 主强调色（棱镜粉）
  accentHover: string;     // 悬浮时强调色
  accentMuted: string;     // 柔和强调色

  // 状态色
  success: string;
  warning: string;
  error: string;
  info: string;
}

/**
 * 主题配置
 */
export interface Theme {
  id: string;
  name: string;
  nameEn: string;
  type: ThemeType;
  colors: ThemeColors;
}

/**
 * 预设主题列表
 */
export const PRESET_THEMES: Theme[] = [
  {
    id: 'vsm-dark',
    name: 'Viewpoint 深色',
    nameEn: 'Viewpoint Dark',
    type: 'dark',
    colors: {
      background: '#0F0F0F',
      panel: '#1E1E1E',
      panelSecondary: '#252526',
      panelTertiary: '#2D2D30',
      border: 'rgba(255,255,255,0.1)',
      borderSubtle: 'rgba(255,255,255,0.06)',
      borderFocus: '#E91E8C',
      textPrimary: '#E8EAED',
      textSecondary: '#9AA0A6',
      textTertiary: '#6E7681',
      textInverse: '#FFFFFF',
      accent: '#E91E8C',
      accentHover: '#F06A9D',
      accentMuted: 'rgba(233,30,140,0.15)',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
    },
  },
  {
    id: 'vsm-dark-plus',
    name: '深度专注',
    nameEn: 'Deep Focus',
    type: 'dark',
    colors: {
      background: '#0A0A0A',
      panel: '#141414',
      panelSecondary: '#1A1A1A',
      panelTertiary: '#1F1F1F',
      border: 'rgba(255,255,255,0.08)',
      borderSubtle: 'rgba(255,255,255,0.04)',
      borderFocus: '#E91E8C',
      textPrimary: '#E0E0E0',
      textSecondary: '#8A8A8A',
      textTertiary: '#5A5A5A',
      textInverse: '#FFFFFF',
      accent: '#E91E8C',
      accentHover: '#F06A9D',
      accentMuted: 'rgba(233,30,140,0.15)',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
    },
  },
  {
    id: 'vsm-light',
    name: 'Viewpoint 浅色',
    nameEn: 'Viewpoint Light',
    type: 'light',
    colors: {
      background: '#FFFFFF',
      panel: '#F5F5F5',
      panelSecondary: '#E8E8E8',
      panelTertiary: '#DCDCDC',
      border: 'rgba(0,0,0,0.1)',
      borderSubtle: 'rgba(0,0,0,0.06)',
      borderFocus: '#E91E8C',
      textPrimary: '#1F1F1F',
      textSecondary: '#5A5A5A',
      textTertiary: '#8A8A8A',
      textInverse: '#FFFFFF',
      accent: '#E91E8C',
      accentHover: '#D6147A',
      accentMuted: 'rgba(233,30,140,0.1)',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
    },
  },
  {
    id: 'vscode-dark',
    name: 'VS Code Dark',
    nameEn: 'VS Code Dark',
    type: 'dark',
    colors: {
      background: '#1E1E1E',
      panel: '#252526',
      panelSecondary: '#2D2D30',
      panelTertiary: '#333337',
      border: 'rgba(255,255,255,0.1)',
      borderSubtle: 'rgba(255,255,255,0.06)',
      borderFocus: '#007ACC',
      textPrimary: '#CCCCCC',
      textSecondary: '#858585',
      textTertiary: '#6E6E6E',
      textInverse: '#FFFFFF',
      accent: '#007ACC',
      accentHover: '#1C97EA',
      accentMuted: 'rgba(0,122,204,0.15)',
      success: '#4EC9B0',
      warning: '#DCDCAA',
      error: '#F48771',
      info: '#75BEFF',
    },
  },
  {
    id: 'vscode-dark-plus',
    name: 'VS Code Dark+',
    nameEn: 'VS Code Dark+',
    type: 'dark',
    colors: {
      background: '#1E1E1E',
      panel: '#2D2D2D',
      panelSecondary: '#353535',
      panelTertiary: '#3E3E42',
      border: 'rgba(255,255,255,0.12)',
      borderSubtle: 'rgba(255,255,255,0.08)',
      borderFocus: '#3794FF',
      textPrimary: '#D4D4D4',
      textSecondary: '#808080',
      textTertiary: '#5A5A5A',
      textInverse: '#FFFFFF',
      accent: '#3794FF',
      accentHover: '#55AAFF',
      accentMuted: 'rgba(55,148,255,0.15)',
      success: '#4EC9B0',
      warning: '#DCDCAA',
      error: '#F48771',
      info: '#75BEFF',
    },
  },
  {
    id: 'notebook',
    name: 'NotebookLM',
    nameEn: 'NotebookLM',
    type: 'dark',
    colors: {
      background: '#0F0F0F',
      panel: '#1E1E1E',
      panelSecondary: '#252525',
      panelTertiary: '#2A2A2A',
      border: 'rgba(255,255,255,0.08)',
      borderSubtle: 'rgba(255,255,255,0.05)',
      borderFocus: '#8AB4F8',
      textPrimary: '#E8EAED',
      textSecondary: '#9AA0A6',
      textTertiary: '#6E7681',
      textInverse: '#FFFFFF',
      accent: '#8AB4F8',
      accentHover: '#A5C9FF',
      accentMuted: 'rgba(138,180,248,0.15)',
      success: '#81C995',
      warning: '#F28B82',
      error: '#F28B82',
      info: '#8AB4F8',
    },
  },
];

/**
 * 获取主题配置
 */
export function getThemeById(id: string): Theme {
  return PRESET_THEMES.find(t => t.id === id) || PRESET_THEMES[0];
}

/**
 * 将主题颜色转换为 CSS 变量字符串
 */
export function themeToCSSVariables(theme: Theme): Record<string, string> {
  const { colors } = theme;
  return {
    '--bg-primary': colors.background,
    '--bg-panel': colors.panel,
    '--bg-panel-secondary': colors.panelSecondary,
    '--bg-panel-tertiary': colors.panelTertiary,
    '--border': colors.border,
    '--border-subtle': colors.borderSubtle,
    '--border-focus': colors.borderFocus,
    '--text-primary': colors.textPrimary,
    '--text-secondary': colors.textSecondary,
    '--text-tertiary': colors.textTertiary,
    '--text-inverse': colors.textInverse,
    '--accent-primary': colors.accent,
    '--accent-hover': colors.accentHover,
    '--accent-muted': colors.accentMuted,
    '--color-success': colors.success,
    '--color-warning': colors.warning,
    '--color-error': colors.error,
    '--color-info': colors.info,
  };
}
