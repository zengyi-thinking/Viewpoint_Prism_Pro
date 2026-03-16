'use client';

import { useState, useEffect, useRef } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { useTranslationStore } from '@/stores/translation.store';
import { translationApi } from '@/services/translation.api';

/**
 * 翻译棱镜主控制台面板
 * 支持多语言工程、字幕编辑、音色克隆、视频修复、导出等功能
 */

import { StatusPill } from '@/components/system';

// 语言列表
const LANGUAGES = [
  { code: 'auto', name: '自动检测', icon: 'AUTO' },
  { code: 'zh-CN', name: '简体中文', icon: 'ZH' },
  { code: 'zh-TW', name: '繁体中文', icon: 'ZT' },
  { code: 'en', name: '英语', icon: 'EN' },
  { code: 'ja', name: '日语', icon: 'JA' },
  { code: 'ko', name: '韩语', icon: 'KO' },
  { code: 'es', name: '西班牙语', icon: 'ES' },
  { code: 'fr', name: '法语', icon: 'FR' },
  { code: 'de', name: '德语', icon: 'DE' },
  { code: 'th', name: '泰语', icon: 'TH' },
  { code: 'vi', name: '越南语', icon: 'VI' },
  { code: 'ru', name: '俄语', icon: 'RU' },
  { code: 'ar', name: '阿拉伯语', icon: 'AR' },
  { code: 'pt', name: '葡萄牙语', icon: 'PT' },
  { code: 'it', name: '意大利语', icon: 'IT' },
];

// 导出格式列表
const EXPORT_FORMATS = [
  { code: 'mp4', name: 'MP4 视频', icon: 'MP4' },
  { code: 'webm', name: 'WebM 视频', icon: 'WEBM' },
  { code: 'srt', name: 'SRT 字幕', icon: 'SRT' },
  { code: 'ass', name: 'ASS 字幕', icon: 'ASS' },
];

// 字幕对齐模式
const ALIGNMENT_MODES = [
  { code: 'bilingual', name: '双语对照', icon: 'BI' },
  { code: 'side-by-side', name: '左右对照', icon: 'LR' },
  { code: 'switch', name: '切换显示', icon: 'SW' },
];

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化百分比
function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

interface TranslationPanelProps {
  videoId?: string;
  onTimeClick?: (timestamp: number) => void;
}

export function TranslationPanel({ videoId, onTimeClick }: TranslationPanelProps) {
  const { currentVideo } = useWorkbenchStore();

  // Translation Store
  const {
    // 任务相关
    taskId,
    task,
    // 语言设置
    sourceLang,
    targetLangs,
    selectedLang,
    // 字幕数据
    sourceSubtitles,
    translatedSubtitles,
    alignmentMode,
    // 音色克隆
    voiceCloneTasks,
    activeVoiceId,
    voicePreviewUrl,
    // 视频修复
    inpaintedVideoUrl,
    // 导出配置
    exportConfig,
    isExporting,
    exportProgress,
    // UI 状态
    selectedSubtitleId,
    isEditingSubtitle,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    error,
    // Actions
    setSourceLang,
    setTargetLangs,
    setSelectedLang,
    setAlignmentMode,
    setSelectedSubtitleId,
    updateSubtitleSegment,
    confirmSubtitleTrack,
    setActiveVoiceId,
    setIsEditingSubtitle,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setExportConfig,
    setIsExporting,
    setExportProgress,
    setIsLoading,
    setError,
    createTask,
    pollTaskStatus,
    cancelTask,
  } = useTranslationStore();

  // 视频引用
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当前活动的标签
  const [activeTab, setActiveTab] = useState<'subtitles' | 'voice-clone' | 'inpainting' | 'export'>('subtitles');

  // 处理视频加载
  useEffect(() => {
    if (currentVideo && videoRef.current) {
      videoRef.current.src = currentVideo.videoUrl || '';
      videoRef.current.load();
    }
  }, [currentVideo?.videoUrl]);

  // 处理任务状态轮询
  useEffect(() => {
    const status = task?.overallStatus;
    if (taskId && status && !['COMPLETED', 'FAILED'].includes(status)) {
      const interval = setInterval(() => {
        const now = Date.now();
        // 使用 pollTaskStatus action 而非直接调用
        pollTaskStatus(taskId);
      }, 3000);

      intervalRef.current = interval;
      return () => clearInterval(interval);
    }
  }, [taskId, task?.overallStatus, pollTaskStatus]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 开始翻译任务
  const handleStartTranslation = async () => {
    if (!videoId) {
      setError('请先选择一个视频');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createTask(videoId, sourceLang, targetLangs.filter(l => l !== 'auto'));
      // 开始轮询任务状态
    } catch (error) {
      console.error('Failed to start translation:', error);
      setError(`翻译任务启动失败: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 语言选择处理
  const handleAddLanguage = (langCode: string) => {
    if (targetLangs.length >= 5) {
      setError('最多选择 5 个目标语言');
      return;
    }
    setTargetLangs([...targetLangs, langCode]);
  };

  const handleRemoveLanguage = (index: number) => {
    const newLangs = targetLangs.filter((_, i) => i !== index);
    const removedLang = targetLangs[index];
    setTargetLangs(newLangs);
    // 如果移除的是当前选中的语言，清除选中
    if (selectedLang === removedLang) {
      setSelectedLang(null);
    }
  };

  // 字幕对齐模式切换
  const handleAlignmentModeChange = (mode: 'bilingual' | 'side-by-side' | 'switch') => {
    setAlignmentMode(mode);
  };

  // 字幕段编辑
  const handleEditSegment = (language: string, segmentId: string) => {
    const segment = translatedSubtitles[language]?.find((s) => s.id === segmentId);
    if (!segment) return;

    setIsEditingSubtitle(true);
    setSelectedSubtitleId(segmentId);
  };

  const handleSegmentChange = (field: 'original' | 'translated', value: string) => {
    if (!selectedLang) return;

    updateSubtitleSegment(selectedLang, selectedSubtitleId!, { [field]: value });
  };

  const handleConfirmSegment = () => {
    if (!selectedLang) return;

    updateSubtitleSegment(selectedLang, selectedSubtitleId!, { confirmed: true });
    confirmSubtitleTrack(selectedLang);
    setIsEditingSubtitle(false);
    setSelectedSubtitleId(null);
  };

  // 播放器控制
  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // 导出处理
  const handleExport = async () => {
    if (!videoId || !taskId) {
      setError('请先完成翻译任务');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      // 模拟导出进度
      for (let i = 0; i <= 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setExportProgress(i * 10);
      }

      const languagesToExport = exportConfig.languages?.filter(l => l !== 'auto') || [selectedLang].filter(Boolean);

      // TODO: 调用导出 API
      console.log('Export with config:', {
        videoId,
        languages: languagesToExport,
        burnSubtitles: exportConfig.burnSubtitles,
        format: exportConfig.format,
      });

      setIsExporting(false);
      setExportProgress(undefined);
    } catch (error) {
      console.error('Export failed:', error);
      setError(`导出失败: ${(error as Error).message}`);
      setIsExporting(false);
    }
  };

  // 如果没有选择视频，显示提示
  if (!videoId) {
    return (
      <div className="panel flex h-full flex-col rounded-none border-x-0 border-t-0 border-b-0">
        <div className="flex flex-1 items-center justify-center bg-bg-panel-tertiary">
          <div className="flex flex-col items-center gap-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5a2 2 2h2a13 2 2H4m0 0a13 2 2v6m9a2 2 2z" />
            </svg>
            <p className="wb-meta text-center">请先选择一个视频</p>
            <p className="wb-meta text-center text-text-tertiary mt-2">
              在左侧视频源面板中选择要翻译的视频
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isTaskActive = !!taskId;
  const taskStages = [
    { status: 'EXTRACTING', label: '字幕' },
    { status: 'TRANSLATING', label: '翻译' },
    { status: 'INPAINTING', label: '修复' },
    { status: 'VOICE_CLONING', label: '音色' },
    { status: 'EXPORTING', label: '导出' },
  ] as const;
  const currentStageIndex = task ? taskStages.findIndex((step) => step.status === task.overallStatus) : -1;

  return (
    <div className="panel flex h-full flex-col rounded-none border-x-0 border-t-0 border-b-0 bg-transparent" ref={containerRef}>
      {/* 头部：任务状态概览 */}
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 6h10" />
                <path d="M9 6c0 6-3 10-6 12" />
                <path d="M8 12c1.2 1.8 2.7 3.3 4.5 4.5" />
                <path d="M16 8l4 10" />
                <path d="M14.5 14h6" />
              </svg>
              <h3 className="wb-section-title">翻译流水线</h3>
            </div>
            {isTaskActive && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                task?.overallStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-200' :
                task?.overallStatus === 'FAILED' ? 'bg-red-500/10 text-red-200' :
                ['EXTRACTING', 'TRANSLATING', 'INPAINTING', 'VOICE_CLONING', 'LIP_SYNCING', 'EXPORTING'].includes(task?.overallStatus || '') ? 'bg-cyan-500/10 text-cyan-200' :
                'bg-gray-500/10 text-gray-100'
              }`}>
                {task?.id?.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={isTaskActive ? 'info' : 'default'}>{isTaskActive ? '任务已启动' : '等待开始'}</StatusPill>
            {error ? <div className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-300">{error}</div> : null}
          </div>
        </div>

        {/* 任务进度指示器 */}
        {isTaskActive && task && (
          <div className="mt-4 grid gap-3 rounded-[20px] bg-bg-panel-secondary/70 px-4 py-4 md:grid-cols-5">
            {taskStages.map((step, index) => {
              const isActive = task?.overallStatus === step.status;
              const isCompleted = currentStageIndex > index || task?.overallStatus === 'COMPLETED';

              return (
                <div key={step.status} className={`rounded-[16px] border px-3 py-3 ${isActive ? 'border-cyan-400/30 bg-cyan-500/8' : 'border-border-subtle bg-bg-panel'}`}>
                  <div className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${
                    isCompleted ? 'bg-emerald-500 text-white' : isActive ? 'bg-cyan-500 text-white' : 'bg-bg-panel-tertiary text-text-secondary'
                  }`}>
                    0{index + 1}
                  </div>
                  <div className="mt-3">
                    <p className={`text-sm font-medium ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                      {step.label}
                    </p>
                    <span className="mt-1 block text-xs text-text-tertiary">
                      {isCompleted ? '已完成' : isActive ? '进行中' : '等待中'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 标签页 */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 border-b border-border-subtle">
        {[
          { id: 'subtitles', label: '步骤 1 · 字幕' },
          { id: 'voice-clone', label: '步骤 2 · 音色' },
          { id: 'inpainting', label: '步骤 3 · 修复' },
          { id: 'export', label: '步骤 4 · 导出' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'subtitles' | 'voice-clone' | 'inpainting' | 'export')}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-500/10 text-cyan-200'
                : 'text-text-tertiary hover:bg-bg-panel-secondary'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {/* 字幕编辑面板 */}
        {activeTab === 'subtitles' && <SubtitleEditorPanel />}
        {/* 音色克隆面板 */}
        {activeTab === 'voice-clone' && <VoiceClonePanel />}
        {/* 视频修复面板 */}
        {activeTab === 'inpainting' && <InpaintingPanel />}
        {/* 导出设置面板 */}
        {activeTab === 'export' && <ExportPanel />}
      </div>

      {/* 底部：开始翻译按钮 */}
      {!isTaskActive && (
        <div className="border-t border-border-subtle px-4 py-3">
          <button
            onClick={handleStartTranslation}
            disabled={isLoading}
            className="w-full rounded-full bg-[linear-gradient(135deg,var(--signal-info),var(--prism-indigo))] py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {isLoading ? '处理中...' : '开始翻译'}
          </button>
        </div>
      )}
    </div>
  );
}

// ========== 子组件 ==========

/**
 * 字幕编辑器子面板
 */
function SubtitleEditorPanel() {
  const {
    sourceLang,
    targetLangs,
    selectedLang,
    alignmentMode,
    sourceSubtitles,
    translatedSubtitles,
    selectedSubtitleId,
    isEditingSubtitle,
    updateSubtitleSegment,
    confirmSubtitleTrack,
    setAlignmentMode,
    setIsEditingSubtitle,
    setSelectedSubtitleId,
  } = useTranslationStore();

  const activeLang = selectedLang || (targetLangs.length > 0 ? targetLangs[0] : 'en');

  // 字幕对齐模式切换
  const handleAlignmentModeChange = (mode: 'bilingual' | 'side-by-side' | 'switch') => {
    setAlignmentMode(mode);
  };

  // 字幕段编辑
  const handleEditSegment = (language: string, segmentId: string) => {
    const segment = translatedSubtitles[language]?.find((s) => s.id === segmentId);
    if (!segment) return;

    setIsEditingSubtitle(true);
    setSelectedSubtitleId(segmentId);
  };

  const handleSegmentChange = (field: 'original' | 'translated', value: string) => {
    if (!selectedLang) return;

    updateSubtitleSegment(selectedLang, selectedSubtitleId!, { [field]: value });
  };

  const handleConfirmSegment = () => {
    if (!selectedLang) return;

    updateSubtitleSegment(selectedLang, selectedSubtitleId!, { confirmed: true });
    confirmSubtitleTrack(selectedLang);
    setIsEditingSubtitle(false);
    setSelectedSubtitleId(null);
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* 工具栏 */}
      <div className="border-b border-border-subtle px-4 py-2 bg-bg-panel-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-text-tertiary">字幕对齐模式:</span>
            <div className="flex gap-1">
              {ALIGNMENT_MODES.map((mode) => (
                <button
                  key={mode.code}
                  onClick={() => setAlignmentMode(mode.code as 'bilingual' | 'side-by-side' | 'switch')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    alignmentMode === mode.code ? 'bg-[#06B6D4]/10 text-white' : 'hover:bg-bg-panel-tertiary'
                  }`}
                  title={mode.name}
                >
                  {mode.icon} {mode.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 双语并排字幕编辑器 */}
      <div className="flex-1 overflow-hidden">
        {/* 源语言字幕 */}
        <div className="w-1/2 h-full overflow-y-auto border-r border-border-subtle p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-text-primary">
              源语言字幕 ({LANGUAGES.find(l => l.code === sourceLang)?.name || '源语言'})
            </h4>
            <div className="text-xs text-text-tertiary">
              {sourceSubtitles.length} 个片段
            </div>
          </div>
          {sourceSubtitles.map((segment) => (
            <div
              key={segment.id}
              className={`p-2 rounded border border ${
                selectedSubtitleId === segment.id
                  ? 'border-[#06B6D4] bg-[#06B6D4]/5'
                  : 'border-border-subtle hover:border-border-subtle bg-bg-panel-tertiary'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs text-text-tertiary font-mono">
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </span>
                <input
                  type="text"
                  value={segment.original}
                  readOnly={selectedSubtitleId !== segment.id}
                  onChange={(e) => handleSegmentChange('original', e.target.value)}
                  className={`flex-1 text-sm ${
                    selectedSubtitleId === segment.id
                      ? 'text-primary bg-transparent'
                      : 'text-text-primary bg-bg-panel-secondary px-2 py-1 rounded'
                  }`}
                />
                {selectedSubtitleId === segment.id && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={segment.translated || ''}
                      onChange={(e) => handleSegmentChange('translated', e.target.value)}
                      placeholder="翻译内容..."
                      className="flex-1 text-sm text-primary bg-bg-panel-secondary px-2 py-1 rounded"
                    />
                    <button
                      onClick={handleConfirmSegment}
                      className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:opacity-80"
                    >
                      ✓ 确认
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 目标语言字幕 */}
        {activeLang && activeLang !== 'auto' && (
          <div className="w-1/2 h-full overflow-y-auto border-r border-border-subtle p-4 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-text-primary">
                目标语言 ({LANGUAGES.find(l => l.code === activeLang)?.name})
              </h4>
              <div className="text-xs text-text-tertiary">
                {(translatedSubtitles[activeLang] || []).length} 个片段
              </div>
            </div>
            {(translatedSubtitles[activeLang] || []).map((segment) => (
              <div
                key={segment.id}
                className={`p-2 rounded border ${
                  selectedSubtitleId === segment.id
                    ? 'border-[#06B6D4] bg-[#06B6D4]/5'
                    : 'border-border-subtle hover:border-border-subtle bg-bg-panel-tertiary'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-tertiary font-mono">
                    {formatTime(segment.start)} - {formatTime(segment.end)}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    {isEditingSubtitle && selectedSubtitleId === segment.id ? (
                      <>
                        <input
                          type="text"
                          value={segment.translated || ''}
                          onChange={(e) => handleSegmentChange('translated', e.target.value)}
                          placeholder="翻译内容..."
                          className="flex-1 text-sm text-primary bg-bg-panel-secondary px-2 py-1 rounded"
                        />
                        <button
                          onClick={handleConfirmSegment}
                          className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:opacity-80"
                        >
                          ✓ 确认
                        </button>
                      </>
                    ) : (
                      <p
                        className={`flex-1 text-sm ${
                          segment.translated
                            ? 'text-primary'
                            : 'text-text-tertiary italic'
                        }`}
                      >
                        {segment.translated || <span className="text-text-tertiary italic">未翻译</span>}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 音色克隆面板
 */
function VoiceClonePanel() {
  const {
    voiceCloneTasks,
    activeVoiceId,
    voicePreviewUrl,
    voicePreviewText,
    sourceLang,
    targetLangs,
    setActiveVoiceId,
  } = useTranslationStore();

  const targetLang = targetLangs.length > 0 ? targetLangs[0] : 'en';

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* 已克隆的音色列表 */}
      <div className="flex-1 overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h4 className="text-sm font-semibold text-text-primary mb-3">已克隆音色</h4>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {voiceCloneTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
              <p>尚未克隆任何音色</p>
              <p className="text-sm text-text-tertiary mt-2">
                点击下方按钮开始音色克隆
              </p>
            </div>
          ) : (
            voiceCloneTasks.map((voice) => (
              <div
                key={voice.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeVoiceId === voice.id
                    ? 'border-[#06B6D4] bg-[#06B6D4]/5'
                    : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
                }`}
                onClick={() => setActiveVoiceId(voice.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 6v1a2 2l4 2v6l-2 2a2-2h6l8a2 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary">{voice.voiceName}</p>
                      <p className="text-xs text-text-tertiary">
                        {targetLang} - {voice.status}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {/* TODO: 删除音色 */}}
                    className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                    title="删除音色"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 19c-2-12-13l5-2l7-7 5-2H6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 音色预览 */}
      {voicePreviewUrl && (
        <div className="p-4 border-t border-border-subtle">
          <h4 className="text-sm font-semibold text-text-primary mb-3">音色预览</h4>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <textarea
                value={voicePreviewText || ''}
                readOnly
                className="w-full h-24 bg-bg-panel-secondary rounded-lg p-3 text-sm text-text-tertiary resize-none"
                placeholder="在此输入预览文本..."
              />
            </div>
            {voicePreviewUrl && (
              <button
                onClick={() => {/* TODO: 播放预览 */}}
                className="px-4 py-2 rounded-lg bg-bg-panel-tertiary text-primary font-medium hover:bg-border"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.75 5.75 12l-2.828-2.828L3.535 7.535 15M15m8.25 12a2 2-828L3.535-15" />
                  <path d="M11 18l-9-9.015 9.015l4.485 9.015 12.97zM12 14l-8.5-8v4.969 8.969 14 12.97L17 17c-4.034 8.034 14.969 12.97L17 17c-4.034 8.034 14.969 12.97L17 17c-4.034 8.034 14.969 12.97L17 17c-4.034 8.034 14.969 12.97z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 视频修复面板
 */
function InpaintingPanel() {
  const {
    inpaintingTasks,
    inpaintedVideoUrl,
  } = useTranslationStore();

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* 修复任务列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {inpaintingTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <p>暂无视频修复任务</p>
            <p className="text-sm text-text-tertiary mt-2">
              视频修复任务会在翻译过程中自动创建
            </p>
          </div>
        ) : (
          inpaintingTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 rounded-lg border border-border-subtle bg-bg-panel-secondary"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-primary">
                    视频修复任务 #{task.id?.slice(0, 6)}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {task.status === 'COMPLETED' ? '已完成' : task.status}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  task.status === 'COMPLETED'
                    ? 'bg-emerald-500/10 text-emerald-100'
                    : ['EXTRACTING', 'TRANSLATING', 'INPAINTING', 'VOICE_CLONING', 'LIP_SYNCING', 'EXPORTING'].includes(task.status)
                    ? 'bg-amber-500/10 text-amber-100'
                    : 'bg-gray-500/10 text-gray-100'
                }`}>
                  {task.progress || 0}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 修复后视频预览 */}
      {inpaintedVideoUrl && (
        <div className="border-t border-border-subtle p-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3">修复后视频预览</h4>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={inpaintedVideoUrl}
              controls
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 导出设置面板
 */
function ExportPanel() {
  const {
    exportConfig,
    isExporting,
    exportProgress,
    setExportConfig,
    setIsExporting,
    setError,
    taskId,
    setExportProgress,
  } = useTranslationStore();

  // 导出处理
  const handleExport = async () => {
    if (!taskId) {
      setError('请先完成翻译任务');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      // 模拟导出进度
      for (let i = 0; i <= 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setExportProgress(i * 10);
      }

      setError(null);
    } catch (error) {
      console.error('Export failed:', error);
      setError(`导出失败: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFormatChange = (format: 'mp4' | 'webm' | 'srt' | 'ass') => {
    setExportConfig({ ...exportConfig, format });
  };

  const handleLanguageToggle = (langCode: string) => {
    const currentLangs = exportConfig.languages || [];
    const newLangs = currentLangs.includes(langCode)
      ? currentLangs.filter((l) => l !== langCode)
      : [...currentLangs, langCode];

    setExportConfig({ ...exportConfig, languages: newLangs });
  };

  const handleBurnToggle = (burn: boolean) => {
    setExportConfig({ ...exportConfig, burnSubtitles: burn });
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4">
      {/* 视频格式选择 */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-3">视频格式</h4>
        <div className="grid grid-cols-4 gap-2">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.code}
              onClick={() => handleFormatChange(format.code as 'mp4' | 'webm' | 'srt' | 'ass')}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                exportConfig.format === format.code
                  ? 'border-[#06B6D4] bg-[#06B6D4]/5'
                  : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
              }`}
            >
              <span className="text-2xl">{format.icon}</span>
              <span className="text-sm font-medium">
                {exportConfig.format === format.code ? format.name : format.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 字幕格式选择 */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-3">字幕格式</h4>
        <div className="flex gap-2">
          <button
            onClick={() => handleFormatChange('srt')}
            className={`flex flex-1 items-center gap-2 p-3 rounded-lg border transition-colors ${
              exportConfig.format === 'srt' ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-lg">📝</span>
            <span className="text-sm font-medium">SRT</span>
          </button>
          <button
            onClick={() => handleFormatChange('ass')}
            className={`flex flex-1 items-center gap-2 p-3 rounded-lg border transition-colors ${
              exportConfig.format === 'ass' ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-lg">📝</span>
            <span className="text-sm font-medium">ASS</span>
          </button>
        </div>
      </div>

      {/* 语言选择 */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-3">导出语言</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleLanguageToggle('zh-CN')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              exportConfig.languages?.includes('zh-CN') ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-xl">🇨🇳</span>
            <span className="text-sm font-medium">简体中文</span>
          </button>
          <button
            onClick={() => handleLanguageToggle('en')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              exportConfig.languages?.includes('en') ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-xl">🇺🇸</span>
            <span className="text-sm font-medium">英语</span>
          </button>
          <button
            onClick={() => handleLanguageToggle('ja')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              exportConfig.languages?.includes('ja') ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-xl">🇯🇵</span>
            <span className="text-sm font-medium">日语</span>
          </button>
          <button
            onClick={() => handleLanguageToggle('ko')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              exportConfig.languages?.includes('ko') ? 'border-[#06B6D4] bg-[#06B6D4]/5' : 'border-border-subtle hover:border-border-subtle bg-bg-panel-secondary'
            }`}
          >
            <span className="text-xl">🇰🇷</span>
            <span className="text-sm font-medium">韩语</span>
          </button>
        </div>
      </div>

      {/* 字幕烧录选项 */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-3">字幕选项</h4>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={exportConfig.burnSubtitles ?? true}
            onChange={(e) => handleBurnToggle(e.target.checked)}
            className="h-4 w-4 rounded border-border-subtle"
          />
          <span className="text-sm text-text-tertiary">烧录字幕到视频中</span>
        </label>
      </div>

      {/* 导出按钮 */}
      <button
        onClick={handleExport}
        disabled={isExporting || !taskId}
        className="w-full py-3 rounded-lg text-sm font-medium bg-[#06B6D4] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
      >
        {isExporting ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v16l0 16-16 16H4a2 2l0-0a2 2h-2a2 2l4 4-4-2v4" />
            </svg>
            <span>导出中... {exportProgress !== undefined ? formatPercent(exportProgress, 100) : ''}</span>
          </div>
        ) : (
          '导出视频和字幕'
        )}
      </button>
    </div>
  );
}
