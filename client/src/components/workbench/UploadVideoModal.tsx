'use client';

import { useState, useRef } from 'react';
import { videoApi, VideoSourceType } from '@/services/video.api';

interface UploadVideoModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadVideoModal({ projectId, onClose, onSuccess }: UploadVideoModalProps) {
  const [uploadType, setUploadType] = useState<'file' | 'url'>('file');
  const [sourceType, setSourceType] = useState<VideoSourceType>('LOCAL_UPLOAD');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-fill title from filename
    const fileTitle = file.name.replace(/\.[^/.]+$/, '');
    setTitle(fileTitle);

    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      await videoApi.upload(projectId, file, (progress) => {
        setProgress(progress);
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlImport = async () => {
    if (!title.trim()) {
      setError('请输入视频标题');
      return;
    }
    if (!url.trim()) {
      setError('请输入视频URL');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await videoApi.import(projectId, {
        title: title.trim(),
        sourceType,
        sourceUrl: url.trim(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="panel w-full max-w-[32rem] rounded-2xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">添加视频</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-tertiary transition hover:bg-bg-panel-tertiary hover:text-text-secondary"
            disabled={isUploading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Upload Type Tabs */}
        <div className="mb-6 flex gap-2 border-b border-border-subtle pb-2">
          <button
            onClick={() => setUploadType('file')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              uploadType === 'file'
                ? 'bg-accent-primary text-text-inverse'
                : 'text-text-tertiary hover:bg-bg-panel-secondary hover:text-text-secondary'
            }`}
            disabled={isUploading}
          >
            本地上传
          </button>
          <button
            onClick={() => setUploadType('url')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              uploadType === 'url'
                ? 'bg-accent-primary text-text-inverse'
                : 'text-text-tertiary hover:bg-bg-panel-secondary hover:text-text-secondary'
            }`}
            disabled={isUploading}
          >
            URL 导入
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* File Upload */}
        {uploadType === 'file' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={handleFileSelect}
              className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-subtle p-8 transition hover:border-accent-primary hover:bg-accent-muted/10 ${
                isUploading ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="mt-3 text-sm text-text-secondary">点击选择视频文件</p>
              <p className="mt-1 text-xs text-text-tertiary">支持 MP4, WebM, MOV 等格式</p>
              <p className="mt-1 text-xs text-text-tertiary opacity-60">最大 2GB</p>
            </div>

            {isUploading && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                  <span>上传中...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-bg-panel-tertiary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* URL Import */}
        {uploadType === 'url' && (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                视频标题
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入视频标题"
                className="input w-full"
                disabled={isUploading}
              />
            </div>

            {/* Source Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                视频源类型
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as VideoSourceType)}
                className="input w-full"
                disabled={isUploading}
              >
                <option value="URL_IMPORT">直接链接 (HTTP/HTTPS)</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="BILIBILI">Bilibili</option>
              </select>
            </div>

            {/* URL */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                视频链接
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={sourceType === 'YOUTUBE' ? 'https://www.youtube.com/watch?v=...' :
                         sourceType === 'BILIBILI' ? 'https://www.bilibili.com/video/...' :
                         'https://example.com/video.mp4'}
                className="input w-full"
                disabled={isUploading}
              />
            </div>

            {/* Import Button */}
            <button
              onClick={handleUrlImport}
              disabled={isUploading}
              className="w-full rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? '导入中...' : '导入视频'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
