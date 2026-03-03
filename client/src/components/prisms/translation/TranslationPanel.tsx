'use client';

import { useState, useEffect, useRef } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { useTranslationStore } from '@/stores/translation.store';
import { translationApi } from '@/services/translation.api';

/**
 * 翻译棱镜主控制台面板
 * 支持多语言工程、字幕编辑、音色克隆、视频修复、导出等功能
 */

// 语言列表
const LANGUAGES = [
  { code: 'auto', name: '自动检测', icon: '🔍' },
  { code: 'zh-CN', name: '简体中文', icon: '🇨🇳' },
  { code: 'zh-TW', name: '繁体中文', icon: '🇹🇼' },
  { code: 'en', name: '英语', icon: '🇺🇸' },
  { code: 'ja', name: '日语', icon: '🇯🇵' },
  { code: 'ko', name: '韩语', icon: '🇰🇷' },
  { code: 'es', name: '西班牙语', icon: '🇪🇸' },
  { code: 'fr', name: '法语', icon: '🇫🇷' },
  { code: 'de', name: '德语', icon: '🇩🇪' },
  { code: 'th', name: '泰语', icon: '🇹🇭' },
  { code: 'vi', name: '越南语', icon: '🇻🇳' },
  { code: 'ru', name: '俄语', icon: '🇷🇺' },
  { code: 'ar', name: '阿拉伯语', icon: '🇸🇦' },
  { code: 'pt', name: '葡萄牙语', icon: '🇵🇹' },
  { code: 'it', name: '意大利语', icon: '🇮🇹' },
];

// 导出格式列表
const EXPORT_FORMATS = [
  { code: 'mp4', name: 'MP4 视频', icon: '🎬' },
  { code: 'webm', name: 'WebM 视频', icon: '🎥' },
  { code: 'srt', name: 'SRT 字幕', icon: '📄' },
  { code: 'ass', name: 'ASS 字幕', icon: '📝' },
];

// 字幕对齐模式
const ALIGNMENT_MODES = [
  { code: 'bilingual', name: '双语对照', icon: '📊' },
  { code: 'side-by-side', name: '左右对照', icon: '⬌' },
  { code: 'switch', name: '切换显示', icon: '🔄' },
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

  return (
    <div className="panel flex h-full flex-col rounded-none border-x-0 border-t-0 border-b-0" ref={containerRef}>
      {/* 头部：任务状态概览 */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 15l4-4 4-4-2-2l4 4-1 2-2-2v6m10a2 2 2z" />
              </svg>
              <h3 className="wb-section-title">翻译任务</h3>
            </div>
            {isTaskActive && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                task?.overallStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-100' :
                task?.overallStatus === 'FAILED' ? 'bg-red-500/10 text-red-100' :
                ['EXTRACTING', 'TRANSLATING', 'INPAINTING', 'VOICE_CLONING', 'LIP_SYNCING', 'EXPORTING'].includes(task?.overallStatus || '') ? 'bg-amber-500/10 text-amber-100' :
                'bg-gray-500/10 text-gray-100'
              }`}>
                {task?.id?.slice(0, 8)}
              </span>
            )}
          </div>
          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 px-2 py-0.5 rounded">
              {error}
            </div>
          )}
        </div>

        {/* 任务进度指示器 */}
        {isTaskActive && task && (
          <div className="flex items-center gap-6 mt-3 px-4 py-2 bg-bg-panel-secondary rounded-lg">
            {[
              { status: 'EXTRACTING', label: '提取字幕', icon: '📝' },
              { status: 'TRANSLATING', label: '翻译字幕', icon: '🌐' },
              { status: 'INPAINTING', label: '视频修复', icon: '🎨' },
              { status: 'VOICE_CLONING', label: '音色克隆', icon: '🎙' },
              { status: 'LIP_SYNCING', label: '口型同步', icon: '👄' },
              { status: 'EXPORTING', label: '导出视频', icon: '📤' },
            ].map((step) => {
              const isActive = task?.overallStatus === step.status;
              const isCompleted = step.status === 'COMPLETED';

              return (
                <div key={step.status} className={`flex items-center gap-3 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    isCompleted ? 'bg-emerald-500 text-white' : 'bg-bg-panel-tertiary'
                  }`}>
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-text-tertiary'}`}>
                      {step.label}
                    </p>
                    {isActive && (
                      <span className="text-xs text-text-tertiary ml-2">进行中...</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 标签页 */}
      <div className="flex items-center gap-1 px-4 border-b border-border-subtle">
        {[
          { id: 'subtitles', label: '字幕编辑', icon: '📝' },
          { id: 'voice-clone', label: '音色克隆', icon: '🎙' },
          { id: 'inpainting', label: '视频修复', icon: '🎨' },
          { id: 'export', label: '导出设置', icon: '📤' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#06B6D4] border-b-2 border-[#06B6D4]'
                : 'text-text-tertiary border-b-2 border-transparent hover:border-border-subtle'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
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
            className="w-full py-3 rounded-lg text-sm font-medium bg-[#06B6D4] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
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
                  onClick={() => setAlignmentMode(mode.code as any)}
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
              onClick={() => handleFormatChange(format.code as any)}
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
