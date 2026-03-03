'use client';

import { create } from 'zustand';

/**
 * 翻译棱镜状态管理
 * 支持多语言工程、字幕编辑、音色克隆、视频修复、导出等功能
 */

// 任务状态枚举
export type TranslationTaskStatus =
  | 'PENDING'
  | 'EXTRACTING'
  | 'TRANSLATING'
  | 'INPAINTING'
  | 'VOICE_CLONING'
  | 'LIP_SYNCING'
  | 'EXPORTING'
  | 'COMPLETED'
  | 'FAILED';

// 字幕段接口
export interface SubtitleSegment {
  id: string;
  start: number; // 开始时间（秒）
  end: number; // 结束时间（秒）
  original: string; // 原文
  translated?: string; // 翻译文本
  confirmed?: boolean; // 用户已确认
}

// 字幕轨道接口
export interface SubtitleTrack {
  id: string;
  language: string; // 语言代码 (en, ja, ko, etc.)
  segments: SubtitleSegment[];
  srtContent?: string; // SRT 格式内容
  isConfirmed?: boolean; // 是否已确认
  createdAt: Date;
  updatedAt: Date;
}

// 翻译任务接口
export interface TranslationTask {
  id: string;
  videoId: string;
  userId: string;
  sourceLang: string;
  targetLangs: string[];

  // 各阶段状态
  subtitleStatus: TranslationTaskStatus;
  inpaintingStatus: TranslationTaskStatus;
  voiceCloneStatus: TranslationTaskStatus;
  lipSyncStatus: TranslationTaskStatus;

  // 输出结果
  outputVideoUrl?: string;
  exports?: Array<{
    language: string;
    srtContent: string;
    videoUrl?: string;
  }>;

  overallStatus: TranslationTaskStatus;

  // 元数据
  createdAt: Date;
  updatedAt: Date;
}

// 导出配置接口
export interface ExportConfig {
  languages?: string[]; // 导出的语言
  burnSubtitles?: boolean; // 是否烧录字幕到视频
  format?: 'mp4' | 'webm' | 'srt' | 'ass'; // 导出格式
}

// 字幕对齐选项
export interface SubtitleAlignment {
  mode: 'bilingual' | 'side-by-side' | 'switch'; // 双语、并排、切换
  separator?: string; // 分隔符（默认 ' / '）
}

interface TranslationStore {
  // 当前任务
  taskId: string | null;
  task: TranslationTask | null;

  // 语言设置
  sourceLang: string;
  targetLangs: string[];
  selectedLang: string | null;

  // 字幕数据
  sourceSubtitles: SubtitleSegment[];
  translatedSubtitles: Record<string, SubtitleSegment[]>; // key: language code
  subtitleTracks: SubtitleTrack[];

  // 字幕对齐设置
  alignmentMode: 'bilingual' | 'side-by-side' | 'switch';
  alignmentSeparator?: string;

  // 音色克隆
  voiceCloneTasks: Array<{
    id: string;
    voiceName: string;
    voiceId: string;
    audioUrl?: string;
    status: TranslationTaskStatus;
    createdAt: Date;
  }>;
  activeVoiceId: string | null;
  voicePreviewUrl?: string;
  voicePreviewText?: string;

  // 视频修复
  inpaintingTasks: Array<{
    id: string;
    videoId: string;
    status: TranslationTaskStatus;
    progress: number;
    createdAt: Date;
  }>;
  inpaintedVideoUrl?: string;

  // 导出配置
  exportConfig: ExportConfig;
  isExporting: boolean;
  exportProgress?: number;

  // UI 状态
  selectedSubtitleId: string | null;
  isEditingSubtitle: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  // 任务状态轮询
  lastPollTime?: number;

  // 加载和错误状态
  isLoading: boolean;
  error: string | null;

  // Actions - 任务管理
  setTaskId: (taskId: string | null) => void;
  setTask: (task: TranslationTask | null) => void;
  setStatus: (status: TranslationTaskStatus) => void;
  setOverallStatus: (status: TranslationTaskStatus) => void;

  // Actions - 语言设置
  setSourceLang: (lang: string) => void;
  setTargetLangs: (langs: string[]) => void;
  setSelectedLang: (lang: string | null) => void;
  setAlignmentMode: (mode: 'bilingual' | 'side-by-side' | 'switch') => void;
  setAlignmentSeparator: (sep?: string) => void;

  // Actions - 字幕数据
  setSourceSubtitles: (segments: SubtitleSegment[]) => void;
  setTranslatedSubtitles: (translations: Record<string, SubtitleSegment[]>) => void;
  setSubtitleTracks: (tracks: SubtitleTrack[]) => void;
  setSelectedSubtitleId: (id: string | null) => void;
  updateSubtitleSegment: (
    language: string,
    segmentId: string,
    updates: Partial<SubtitleSegment>,
  ) => void;
  confirmSubtitleTrack: (language: string) => void;
  importSubtitles: (language: string, srtContent: string) => void;

  // Actions - 音色克隆
  setActiveVoiceId: (voiceId: string | null) => void;
  setVoicePreviewUrl: (url: string | undefined) => void;
  setVoicePreviewText: (text: string | undefined) => void;

  // Actions - 视频修复
  setInpaintedVideoUrl: (url: string | undefined) => void;

  // Actions - 导出
  setExportConfig: (config: ExportConfig) => void;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress?: number) => void;

  // Actions - UI 状态
  setIsEditingSubtitle: (isEditing: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (currentTime: number) => void;
  setDuration: (duration: number) => void;

  // Actions - 加载和错误
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Actions - 任务操作
  createTask: (videoId: string, sourceLang: string, targetLangs: string[]) => Promise<void>;
  pollTaskStatus: (taskId: string, userId?: string) => Promise<void>;
  cancelTask: () => void;

  // Actions - 清理
  clear: () => void;
}

// 初始状态
const initialState: Omit<TranslationStore, 'setTaskId' | 'setTask' | 'setStatus' | 'setOverallStatus' | 'setSourceLang' | 'setTargetLangs' | 'setSelectedLang' | 'setAlignmentMode' | 'setAlignmentSeparator' | 'setSourceSubtitles' | 'setTranslatedSubtitles' | 'setSubtitleTracks' | 'setSelectedSubtitleId' | 'updateSubtitleSegment' | 'confirmSubtitleTrack' | 'importSubtitles' | 'setActiveVoiceId' | 'setVoicePreviewUrl' | 'setVoicePreviewText' | 'setInpaintedVideoUrl' | 'setExportConfig' | 'setIsExporting' | 'setExportProgress' | 'setIsEditingSubtitle' | 'setIsPlaying' | 'setCurrentTime' | 'setDuration' | 'setIsLoading' | 'setError' | 'createTask' | 'pollTaskStatus' | 'cancelTask' | 'clear'> = {
  // 当前任务
  taskId: null,
  task: null,

  // 语言设置
  sourceLang: 'auto',
  targetLangs: ['en'],
  selectedLang: 'en',

  // 字幕数据
  sourceSubtitles: [],
  translatedSubtitles: {},
  subtitleTracks: [],
  alignmentMode: 'bilingual',
  alignmentSeparator: ' / ',

  // 音色克隆
  voiceCloneTasks: [],
  activeVoiceId: null,
  voicePreviewUrl: undefined,
  voicePreviewText: undefined,

  // 视频修复
  inpaintingTasks: [],
  inpaintedVideoUrl: undefined,

  // 导出配置
  exportConfig: {
    languages: ['en'],
    burnSubtitles: true,
    format: 'mp4',
  },
  isExporting: false,

  // UI 状态
  selectedSubtitleId: null,
  isEditingSubtitle: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  // 加载和错误状态
  isLoading: false,
  error: null,

  // 任务状态轮询
  lastPollTime: undefined,
};

export const useTranslationStore = create<TranslationStore>((set, get) => ({
  ...initialState,

  // Actions - 任务管理
  setTaskId: (taskId) => set({ taskId }),
  setTask: (task) => set({ task }),
  setStatus: (status) => set((state) => {
    if (!state.task) return state;
    return {
      task: { ...state.task, overallStatus: status },
    };
  }),
  setOverallStatus: (status) => set((state) => ({
    task: state.task ? { ...state.task, overallStatus: status } : null,
  })),

  // Actions - 语言设置
  setSourceLang: (sourceLang) => set({ sourceLang }),
  setTargetLangs: (targetLangs) => set({ targetLangs }),
  setSelectedLang: (selectedLang) => set({ selectedLang }),
  setAlignmentMode: (alignmentMode) => set({ alignmentMode }),
  setAlignmentSeparator: (separator) => set({ alignmentSeparator: separator }),

  // Actions - 字幕数据
  setSourceSubtitles: (sourceSubtitles) => set({ sourceSubtitles }),
  setTranslatedSubtitles: (translatedSubtitles) => set({ translatedSubtitles }),
  setSubtitleTracks: (subtitleTracks) => set({ subtitleTracks }),
  setSelectedSubtitleId: (selectedSubtitleId) => set({ selectedSubtitleId }),
  updateSubtitleSegment: (language, segmentId, updates) =>
    set((state) => {
      const langSubs = state.translatedSubtitles[language] || [];
      return {
        translatedSubtitles: {
          ...state.translatedSubtitles,
          [language]: langSubs.map((seg) =>
            seg.id === segmentId ? { ...seg, ...updates } : seg
          ),
        },
      };
    }),
  confirmSubtitleTrack: (language) =>
    set((state) => ({
      subtitleTracks: state.subtitleTracks.map((track) =>
        track.language === language ? { ...track, isConfirmed: true } : track
      ),
    })),
  importSubtitles: async (language, srtContent) => {
    // TODO: 实现 SRT 导入
    console.log('Import subtitles for language:', language, 'content length:', srtContent?.length);
  },

  // Actions - 音色克隆
  setActiveVoiceId: (activeVoiceId) => set({ activeVoiceId }),
  setVoicePreviewUrl: (voicePreviewUrl) => set({ voicePreviewUrl }),
  setVoicePreviewText: (voicePreviewText) => set({ voicePreviewText }),

  // Actions - 视频修复
  setInpaintedVideoUrl: (inpaintedVideoUrl) => set({ inpaintedVideoUrl }),

  // Actions - 导出
  setExportConfig: (exportConfig) => set({ exportConfig }),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),

  // Actions - UI 状态
  setIsEditingSubtitle: (isEditingSubtitle) => set({ isEditingSubtitle }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),

  // Actions - 加载和错误
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Actions - 任务操作
  createTask: async (videoId, sourceLang, targetLangs) => {
    // TODO: 调用 API 创建翻译任务
    console.log('Create translation task:', { videoId, sourceLang, targetLangs });
  },
  pollTaskStatus: async (taskId, userId) => {
    // TODO: 轮询任务状态
    console.log('Poll task status:', taskId, 'user:', userId);
  },
  cancelTask: () => {
    console.log('Cancel task:', get().taskId);
    // TODO: 调用 API 取消任务
  },

  // Actions - 清理
  clear: () => set(initialState as any),
}));
