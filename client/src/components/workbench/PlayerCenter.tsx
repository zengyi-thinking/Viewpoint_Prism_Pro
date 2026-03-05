'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { getToken } from '@/services/api';
import { useVideoBehaviorTracking } from '@/hooks/useVideoBehaviorTracking';
import { VideoEventType, VideoActionContext } from '@/types/video-behavior';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Default player height (can be adjusted via resize handle)
const MIN_PLAYER_HEIGHT = 220;

interface PlayerCenterProps {
  videoRef?: React.RefObject<HTMLVideoElement | null> | null;
}

export function PlayerCenter({ videoRef: externalVideoRef }: PlayerCenterProps = {}) {
  const { currentVideo, seekRequest, clearSeekRequest } = useWorkbenchStore();
  const tracking = useVideoBehaviorTracking({
    videoId: currentVideo?.id ?? '',
    enabled: !!currentVideo?.id,
    context: VideoActionContext.NORMAL,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步外部 videoRef（用于 ChatDock 的帧捕获）
  useEffect(() => {
    if (externalVideoRef && videoRef.current) {
      // 更新外部 ref 指向内部的 video 元素
      (externalVideoRef as any).current = videoRef.current;
    }
  }, [externalVideoRef]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get full video URL with token
  const getVideoUrl = (video: typeof currentVideo) => {
    if (!video) return '';

    // If videoUrl is already a full URL (http/https), use it directly
    if (video.videoUrl && (video.videoUrl.startsWith('http://') || video.videoUrl.startsWith('https://'))) {
      return video.videoUrl;
    }

    // If videoUrl is empty or not a full URL, try sourceUrl
    if (video.sourceUrl && (video.sourceUrl.startsWith('http://') || video.sourceUrl.startsWith('https://'))) {
      return video.sourceUrl;
    }

    // For relative paths (stream endpoint), prepend API base and add token
    const relativePath = video.videoUrl || video.storagePath || '';
    if (!relativePath) return '';

    // 确保正确拼接 URL（添加斜杠）
    const baseUrl = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
    const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

    const token = getToken();
    const separator = path.includes('?') ? '&' : '?';
    return `${baseUrl}${path}${separator}token=${encodeURIComponent(token || '')}`;
  };

  // Reset state when video changes
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      setError(null);
      const fullUrl = getVideoUrl(currentVideo);
      console.log('Loading video:', fullUrl);
      videoRef.current.src = fullUrl;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentVideo]);

  // Handle video error
  const handleVideoError = () => {
    if (videoRef.current) {
      const err = videoRef.current.error;
      let errorMsg = '视频加载失败';
      if (err) {
        switch (err.code) {
          case err.MEDIA_ERR_ABORTED:
            errorMsg = '视频加载被中断';
            break;
          case err.MEDIA_ERR_NETWORK:
            errorMsg = '网络错误，无法加载视频';
            break;
          case err.MEDIA_ERR_DECODE:
            errorMsg = '视频解码失败';
            break;
          case err.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = '不支持的视频格式';
            break;
        }
      }
      setError(errorMsg);
      console.error('Video error:', err, 'URL:', getVideoUrl(currentVideo));
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  // Handle time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setError(null);

      // Apply deferred seek if node jump happened before metadata was ready.
      if (pendingSeekRef.current !== null) {
        const target = Math.max(
          0,
          Math.min(
            pendingSeekRef.current,
            Number.isFinite(videoRef.current.duration)
              ? videoRef.current.duration
              : pendingSeekRef.current,
          ),
        );
        const previousTime = videoRef.current.currentTime;
        videoRef.current.currentTime = target;
        setCurrentTime(target);
        tracking.trackEvent(VideoEventType.SEEK, {
          previousTime,
          currentTime: target,
        });
        pendingSeekRef.current = null;
      }
    }
  };

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      const previousTime = videoRef.current.currentTime;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      tracking.trackEvent(VideoEventType.SEEK, {
        previousTime,
        currentTime: time,
      });
    }
  };

  // External seek requests from prism panel (mindmap/crystal cards).
  useEffect(() => {
    if (!seekRequest) return;

    const player = videoRef.current;
    if (!player) {
      pendingSeekRef.current = seekRequest.timestamp;
      clearSeekRequest();
      return;
    }

    const hasMeta = Number.isFinite(player.duration) && player.duration > 0;
    if (!hasMeta) {
      pendingSeekRef.current = seekRequest.timestamp;
      clearSeekRequest();
      return;
    }

    const target = Math.max(0, Math.min(seekRequest.timestamp, player.duration));
    const previousTime = player.currentTime;
    player.currentTime = target;
    setCurrentTime(target);
    tracking.trackEvent(VideoEventType.SEEK, {
      previousTime,
      currentTime: target,
    });
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest, tracking]);

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      setVolume(vol);
      tracking.trackEvent(VideoEventType.VOLUME_CHANGE, {
        currentTime: videoRef.current.currentTime,
        volume: vol,
      });
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (!isFullscreen) {
        videoRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (document.fullscreenElement) {
        tracking.trackEvent(VideoEventType.FULLSCREEN, {
          currentTime: videoRef.current?.currentTime ?? 0,
        });
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Empty state
  if (!currentVideo) {
    return (
      <div className="panel flex flex-1 flex-col rounded-none border-x-0 border-t-0 min-h-0">
        {/* Video Player Area */}
        <div className="flex flex-1 items-center justify-center bg-bg-panel-tertiary">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-bg-panel-secondary">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary opacity-30">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-text-secondary">选择左侧视频开始播放</p>
          </div>
        </div>

        {/* Timeline / Controls bar */}
        <div className="flex h-11 shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-panel-secondary px-3">
          <button className="text-text-tertiary transition hover:text-text-secondary" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <span className="text-[11px] font-mono text-text-tertiary tabular-nums">00:00 / 00:00</span>
          <div className="flex-1">
            <div className="h-0.5 rounded-full bg-bg-panel-tertiary">
              <div className="h-full w-0 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#E91E8C]" />
            </div>
          </div>
          <button className="text-text-tertiary transition hover:text-text-secondary" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
            </svg>
          </button>
          <button className="text-text-tertiary transition hover:text-text-secondary" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="panel flex h-full min-h-[220px] flex-col rounded-none border-x-0 border-t-0 overflow-hidden"
      style={{ minHeight: MIN_PLAYER_HEIGHT }}
    >
      {/* Video Title Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
        <h3 className="wb-section-title truncate pr-2">{currentVideo.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {currentVideo.resolution && (
            <span className="wb-meta tabular-nums">{currentVideo.resolution}</span>
          )}
          {currentVideo.thumbnailUrl && (
            <span className="status-dot status-dot-success" title="已生成缩略图" />
          )}
        </div>
      </div>

      {/* Video Player Area - maintains 16:9 aspect ratio */}
      <div className="relative flex-1 bg-black min-h-0">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-red-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <p className="text-xs text-text-secondary">{error}</p>
              <p className="mt-1 text-[10px] text-text-tertiary break-all">{getVideoUrl(currentVideo)}</p>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full flex items-center justify-center">
            <video
              ref={videoRef}
              className="max-h-full max-w-full object-contain"
              style={{ aspectRatio: '16/9' }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              onPlay={() => {
                setIsPlaying(true);
                tracking.trackEvent(VideoEventType.PLAY, {
                  currentTime: videoRef.current?.currentTime ?? 0,
                });
              }}
              onPause={() => {
                setIsPlaying(false);
                tracking.trackEvent(VideoEventType.PAUSE, {
                  currentTime: videoRef.current?.currentTime ?? 0,
                });
              }}
              onEnded={() => {
                tracking.trackEvent(VideoEventType.END, {
                  currentTime: videoRef.current?.duration ?? 0,
                });
                tracking.endSession(videoRef.current?.duration ?? 0);
              }}
              controls={false}
              playsInline
              crossOrigin="anonymous"
            />
          </div>
        )}
      </div>

      {/* Timeline / Controls bar */}
      <div className="flex shrink-0 h-11 items-center gap-3 border-t border-border-subtle bg-bg-panel-secondary px-3">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="text-text-tertiary transition hover:text-text-secondary shrink-0"
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Time */}
        <span className="text-[11px] font-mono text-text-tertiary tabular-nums shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Progress bar */}
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min="0"
            max={isFinite(duration) ? duration : 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-bg-panel-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
        </div>

        {/* Volume */}
        <button
          onClick={toggleMute}
          className="text-text-tertiary transition hover:text-text-secondary shrink-0"
          title={videoRef.current?.muted ? '取消静音' : '静音'}
        >
          {volume === 0 || videoRef.current?.muted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
            </svg>
          )}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="text-text-tertiary transition hover:text-text-secondary shrink-0"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
