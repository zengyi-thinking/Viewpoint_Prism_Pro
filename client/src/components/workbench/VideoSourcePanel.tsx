'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { videoApi, VideoSource } from '@/services/video.api';
import { UploadVideoModal } from './UploadVideoModal';
import { useWorkbenchStore } from '@/stores/workbench.store';

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
  const queryClient = useQueryClient();

  // WorkbenchStore state
  const {
    selectedVideoIds,
    toggleVideoSelection,
    clearVideoSelection,
    setCurrentVideo,
    currentVideo,
  } = useWorkbenchStore();

  // 使用 React Query 获取视频列表
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', projectId],
    queryFn: () => videoApi.list(projectId!),
    enabled: !!projectId,
  });

  // 上传成功后失效缓存，触发重新获取
  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
  };

  // Filter videos by search
  const filtered = videos.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase()),
  );

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle video play (click on card, not checkbox)
  const handleVideoPlay = (video: VideoSource) => {
    setCurrentVideo(video);
  };

  // Handle confirm import (analyze selected videos)
  const handleConfirmImport = async () => {
    if (selectedVideoIds.length === 0) return;

    try {
      // TODO: 调用后端分析API
      // await videoApi.analyze(selectedVideoIds);

      console.log('Starting analysis for videos:', selectedVideoIds);

      // 显示成功提示（可以使用 toast）
      alert(`已选择 ${selectedVideoIds.length} 个视频进行分析`);
      clearVideoSelection();
    } catch (error) {
      console.error('Failed to analyze videos:', error);
      alert('分析启动失败，请重试');
    }
  };

  // Handle delete video
  const handleDeleteVideo = async () => {
    if (!deleteConfirmVideo) return;

    setIsDeleting(true);
    try {
      await videoApi.delete(deleteConfirmVideo.id);

      // If deleted video was currently playing, clear it
      if (currentVideo?.id === deleteConfirmVideo.id) {
        setCurrentVideo(null);
      }

      // Remove from selection if it was selected
      if (selectedVideoIds.includes(deleteConfirmVideo.id)) {
        toggleVideoSelection(deleteConfirmVideo.id);
      }

      // Refresh the video list
      queryClient.invalidateQueries({ queryKey: ['videos', projectId] });

      setDeleteConfirmVideo(null);
    } catch (error) {
      console.error('Failed to delete video:', error);
      alert('删除视频失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle select all
  const handleSelectAll = () => {
    const allIds = filtered.map((v) => v.id);
    // 如果当前全部选中，则清空；否则选中所有
    if (allIds.length > 0 && selectedVideoIds.length === allIds.length) {
      clearVideoSelection();
    } else {
      // Select all filtered videos
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
    }
  };

  // 收起状态：只显示图标
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
        {/* Header */}
        <div className="border-b border-border-subtle p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary">视频源</h2>
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
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索视频..."
              className="input w-full py-2 pl-9 pr-3 text-xs"
            />
          </div>
        </div>

        {/* Select All bar (only show when there are videos) */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-xs text-text-tertiary transition hover:text-text-secondary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {selectedVideoIds.length === filtered.length ? (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 12l2 2 4-4" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                  </>
                )}
              </svg>
              {selectedVideoIds.length === filtered.length ? '取消全选' : '全选'}
            </button>
            <span className="text-xs text-text-tertiary">
              {selectedVideoIds.length} / {filtered.length}
            </span>
          </div>
        )}

        {/* Video list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="status-dot status-dot-warning animate-pulse" />
              <span className="ml-2 text-xs text-text-tertiary">加载中...</span>
            </div>
          ) : !projectId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 text-text-tertiary opacity-30">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
              <p className="text-xs text-text-tertiary">请先选择一个项目</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 text-text-tertiary opacity-30">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
              <p className="text-xs text-text-tertiary">暂无视频</p>
              <p className="mt-1 text-[10px] text-text-tertiary opacity-60">点击"添加"导入视频</p>
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
                    {/* Checkbox (NotebookLM style) */}
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

                    {/* Video card (clickable for playing) */}
                    <button
                      onClick={() => handleVideoPlay(v)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {/* Thumbnail */}
                      <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-bg-panel-tertiary overflow-hidden">
                        {v.thumbnailUrl ? (
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary opacity-30">
                            <path d="M10 8l6 4-6 4V8z" />
                          </svg>
                        )}
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-text-secondary">{v.title}</p>
                        <p className="text-[10px] text-text-tertiary">{formatDuration(v.duration)}</p>
                      </div>
                      {/* Status indicators */}
                      <div className="flex gap-1">
                        {v.transcriptStatus === 'COMPLETED' && (
                          <span className="status-dot status-dot-success" title="转写完成" />
                        )}
                        {v.keyframeStatus === 'COMPLETED' && (
                          <span className="status-dot status-dot-success" title="关键帧提取完成" />
                        )}
                      </div>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmVideo(v);
                      }}
                      className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-text-tertiary transition hover:bg-red-500/20 hover:text-red-400"
                      title="删除视频"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirm Import Button (show when videos are selected) */}
        {selectedVideoIds.length > 0 && (
          <div className="border-t border-border-subtle p-3">
            <button
              onClick={handleConfirmImport}
              className="w-full rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-text-inverse transition hover:opacity-90"
            >
              确认导入 ({selectedVideoIds.length})
            </button>
          </div>
        )}
      </aside>

      {/* Upload Modal */}
      {showUploadModal && projectId && (
        <UploadVideoModal
          projectId={projectId}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel w-full max-w-sm rounded-2xl p-6">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">删除视频</h3>
            <p className="mb-6 text-sm text-text-secondary">
              确定要删除视频 <span className="font-medium text-text-primary">"{deleteConfirmVideo.title}"</span> 吗？
              <br />
              <span className="text-xs text-text-tertiary">此操作将同时删除视频文件和缩略图，无法恢复。</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmVideo(null)}
                disabled={isDeleting}
                className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-bg-panel-tertiary disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteVideo}
                disabled={isDeleting}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
