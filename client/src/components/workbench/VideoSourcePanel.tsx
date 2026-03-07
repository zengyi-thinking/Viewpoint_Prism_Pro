'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '@/services/knowledge.api';
import { videoApi, VideoSource } from '@/services/video.api';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { UploadVideoModal } from './UploadVideoModal';

interface VideoSourcePanelProps {
  projectId?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function VideoSourcePanel({
  projectId,
  collapsed = false,
  onToggle,
}: VideoSourcePanelProps) {
  const [search, setSearch] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<VideoSource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const {
    selectedVideoIds,
    toggleVideoSelection,
    clearVideoSelection,
    setCurrentVideo,
    currentVideo,
  } = useWorkbenchStore();

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', projectId],
    queryFn: () => videoApi.list(projectId!),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId || !currentVideo) return;
    if (currentVideo.projectId !== projectId) {
      setCurrentVideo(null);
    }
  }, [projectId, currentVideo, setCurrentVideo]);

  useEffect(() => {
    if (!projectId || isLoading) return;

    if (videos.length === 0) {
      if (currentVideo) {
        setCurrentVideo(null);
      }
      return;
    }

    const matchedCurrent = currentVideo
      ? videos.find((video) => video.id === currentVideo.id)
      : null;

    if (!matchedCurrent) {
      setCurrentVideo(videos[0]);
    }
  }, [projectId, isLoading, videos, currentVideo, setCurrentVideo]);

  const filtered = useMemo(
    () => videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase())),
    [videos, search],
  );

  const handleUploadSuccess = (uploadedVideo?: VideoSource) => {
    if (uploadedVideo && projectId) {
      queryClient.setQueryData<VideoSource[]>(['videos', projectId], (existing = []) => {
        const withoutOld = existing.filter((video) => video.id !== uploadedVideo.id);
        return [uploadedVideo, ...withoutOld];
      });
      setCurrentVideo(uploadedVideo);
    }

    void queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoPlay = (video: VideoSource) => {
    setCurrentVideo(video);
  };

  const handleConfirmImport = async () => {
    if (selectedVideoIds.length === 0 || isAnalyzing) return;

    const firstSelectedVideo =
      filtered.find((video) => selectedVideoIds.includes(video.id)) ??
      videos.find((video) => selectedVideoIds.includes(video.id)) ??
      null;

    setIsAnalyzing(true);
    try {
      const batchResult = await knowledgeApi.analyzeBatch({
        videoIds: selectedVideoIds,
        regenerateTranscript: false,
        regenerateKeyframes: false,
      });

      await queryClient.invalidateQueries({ queryKey: ['videos', projectId] });

      if (!currentVideo && firstSelectedVideo) {
        setCurrentVideo(firstSelectedVideo);
      }

      const failedDetails = batchResult.results
        .filter((item) => item.status === 'failed')
        .map((item) => `- ${item.videoId}: ${item.error || '未知错误'}`)
        .join('\n');

      alert(
        batchResult.failed > 0
          ? `分析完成：成功 ${batchResult.completed} 个，失败 ${batchResult.failed} 个。\n\n失败详情：\n${failedDetails}`
          : `分析完成：成功 ${batchResult.completed} 个，失败 ${batchResult.failed} 个。`,
      );
      clearVideoSelection();
    } catch (error) {
      console.error('Failed to analyze videos:', error);
      const message = error instanceof Error ? error.message : '分析启动失败';
      alert(`分析失败：${message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!deleteConfirmVideo) return;

    setIsDeleting(true);
    try {
      await videoApi.delete(deleteConfirmVideo.id);

      if (currentVideo?.id === deleteConfirmVideo.id) {
        setCurrentVideo(null);
      }

      if (selectedVideoIds.includes(deleteConfirmVideo.id)) {
        toggleVideoSelection(deleteConfirmVideo.id);
      }

      await queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
      setDeleteConfirmVideo(null);
    } catch (error) {
      console.error('Failed to delete video:', error);
      alert('删除视频失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectAll = () => {
    const allIds = filtered.map((v) => v.id);
    if (allIds.length > 0 && selectedVideoIds.length === allIds.length) {
      clearVideoSelection();
      return;
    }

    selectedVideoIds.forEach((id) => {
      if (!allIds.includes(id)) {
        toggleVideoSelection(id);
      }
    });
    allIds.forEach((id) => {
      if (!selectedVideoIds.includes(id)) {
        toggleVideoSelection(id);
      }
    });
  };

  if (collapsed) {
    return (
      <aside className="flex h-full w-full flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="rounded-lg p-2 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
          title="展开视频源"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <path d="M10 8l6 4-6 4V8z" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside className="panel flex h-full w-full flex-col">
        <div className="border-b border-border-subtle p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="wb-section-title">视频源</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="badge badge-accent"
                disabled={!projectId}
              >
                + 添加
              </button>
              <button
                onClick={onToggle}
                className="rounded-lg p-1 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
                title="收起面板"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索视频..."
            className="input w-full"
          />
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-text-secondary transition hover:text-text-primary"
            >
              {selectedVideoIds.length === filtered.length ? '取消全选' : '全选'}
            </button>
            <span className="text-xs text-text-tertiary">已选 {selectedVideoIds.length}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-text-tertiary">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-bg-panel-tertiary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <path d="M10 8l6 4-6 4V8z" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary">暂无视频</p>
              <p className="mt-1 text-xs text-text-tertiary">点击“添加”导入视频</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((v) => {
                const isSelected = selectedVideoIds.includes(v.id);
                const isCurrentlyPlaying = currentVideo?.id === v.id;

                return (
                  <div
                    key={v.id}
                    className={`group flex items-center gap-2 rounded-xl p-2 transition ${
                      isSelected
                        ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30'
                        : isCurrentlyPlaying
                          ? 'bg-accent-secondary/20 ring-1 ring-accent-secondary/40'
                          : 'hover:bg-bg-panel-secondary'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoSelection(v.id);
                      }}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        isSelected
                          ? 'border-accent-primary bg-accent-primary text-white'
                          : 'border-border-subtle bg-transparent text-transparent hover:border-accent-primary/50'
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </button>

                    <button
                      onClick={() => handleVideoPlay(v)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-panel-tertiary">
                        {v.thumbnailUrl ? (
                          <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary opacity-30">
                            <path d="M10 8l6 4-6 4V8z" />
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{v.title}</p>
                        <p className="wb-meta">{formatDuration(v.duration)}</p>
                      </div>

                      <div className="flex gap-1">
                        {v.transcriptStatus === 'COMPLETED' && (
                          <span className="status-dot status-dot-success" title="转写完成" />
                        )}
                        {v.keyframeStatus === 'COMPLETED' && (
                          <span className="status-dot status-dot-success" title="关键帧完成" />
                        )}
                      </div>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmVideo(v);
                      }}
                      className="rounded-lg p-1 text-text-tertiary opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                      title="删除视频"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedVideoIds.length > 0 && (
          <div className="border-t border-border-subtle p-3">
            <button
              onClick={handleConfirmImport}
              disabled={isAnalyzing}
              className="w-full rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? '分析中...' : `确认分析 (${selectedVideoIds.length})`}
            </button>
          </div>
        )}
      </aside>

      {showUploadModal && projectId && (
        <UploadVideoModal
          projectId={projectId}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {deleteConfirmVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel w-full max-w-[30rem] rounded-2xl p-6">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">删除视频</h3>
            <p className="mb-6 text-sm text-text-secondary">
              确定要删除视频 <span className="font-medium text-text-primary">&quot;{deleteConfirmVideo.title}&quot;</span> 吗？
              <br />
              <span className="text-xs text-text-tertiary">此操作将同时删除视频文件和缩略图，无法恢复。</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmVideo(null)}
                disabled={isDeleting}
                className="rounded-lg px-4 py-2 text-sm text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
              >
                取消
              </button>
              <button
                onClick={handleDeleteVideo}
                disabled={isDeleting}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
