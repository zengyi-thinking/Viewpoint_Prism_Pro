'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { getToken } from '@/services/api';
import { videoApi } from '@/services/video.api';
import { useVideoBehaviorTracking } from '@/hooks/useVideoBehaviorTracking';
import { VideoEventType, VideoActionContext } from '@/types/video-behavior';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:7860');

// Default player height (can be adjusted via resize handle)
const MIN_PLAYER_HEIGHT = 220;

interface PlayerCenterProps {
  videoRef?: React.RefObject<HTMLVideoElement | null> | null;
}

export function PlayerCenter({ videoRef: externalVideoRef }: PlayerCenterProps = {}) {
  const { currentVideo, seekRequest, clearSeekRequest, setCurrentPlaybackTime } =
    useWorkbenchStore();
  const tracking = useVideoBehaviorTracking({
    videoId: currentVideo?.id ?? '',
    enabled: !!currentVideo?.id,
    context: VideoActionContext.NORMAL,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const bindVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (externalVideoRef) {
      (externalVideoRef as any).current = el;
    }
  };
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState('');
  const [videoCandidates, setVideoCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Build candidate URLs for robust playback fallback
  const buildVideoCandidates = async (video: typeof currentVideo) => {
    if (!video) return [] as string[];
    const token = getToken();
    const urls: string[] = [];

    // 对本地上传视频，优先走后端受保护 stream 端点，避免 MinIO 直链跨域导致播放失败。
    if (video.sourceType === 'LOCAL_UPLOAD' && video.id) {
      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const qs = new URLSearchParams();
      if (token) qs.set('token', token);
      qs.set('_ts', video.updatedAt || video.createdAt || '');
      urls.push(`${base}/api/videos/${video.id}/stream?${qs.toString()}`);
    }

    // If videoUrl is already a full URL (http/https), use it directly
    if (video.videoUrl && (video.videoUrl.startsWith('http://') || video.videoUrl.startsWith('https://'))) {
      urls.push(video.videoUrl);
    }

    // If videoUrl is empty or not a full URL, try sourceUrl
    if (video.sourceUrl && (video.sourceUrl.startsWith('http://') || video.sourceUrl.startsWith('https://'))) {
      urls.push(video.sourceUrl);
    }

    // For relative paths (stream endpoint), prepend API base and add token
    const relativePath = video.videoUrl || video.storagePath || '';
    if (relativePath) {
      const baseUrl = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
      const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
      const separator = path.includes('?') ? '&' : '?';
      urls.push(`${baseUrl}${path}${separator}token=${encodeURIComponent(token || '')}`);
    }

    // 最后补一个后端签名播放地址，增强兼容性（MinIO 私有桶/直链失效时可用）。
    if (video.id) {
      try {
        const play = await videoApi.getPlayUrl(video.id);
        if (play?.url) urls.push(play.url);
      } catch {
        console.warn('Failed to get signed play url, continue fallback candidates');
      }
    }

    const unique = Array.from(new Set(urls.filter(Boolean)));
    return unique;
  };

  const loadVideoAt = (urls: string[], index: number) => {
    if (!videoRef.current) return;
    const target = urls[index] || '';
    setResolvedVideoUrl(target);
    videoRef.current.src = target;
    videoRef.current.load();
  };

  // Reset state when video changes
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!videoRef.current || !currentVideo) {
        setResolvedVideoUrl('');
        setVideoCandidates([]);
        setCandidateIndex(0);
        return;
      }

      setError(null);
      setIsPlaying(false);
      setCurrentTime(0);

      const candidates = await buildVideoCandidates(currentVideo);
      if (cancelled) return;

      setVideoCandidates(candidates);
      setCandidateIndex(0);

      if (candidates.length > 0) {
        console.log('Loading video candidate:', candidates[0]);
        loadVideoAt(candidates, 0);
      } else {
        setError('未找到可播放的视频地址');
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [currentVideo]);

  // Handle video error
  const handleVideoError = () => {
    if (!videoRef.current) return;

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

    const nextIndex = candidateIndex + 1;
    if (nextIndex < videoCandidates.length) {
      console.warn('Video candidate failed, trying next source', {
        current: resolvedVideoUrl,
        next: videoCandidates[nextIndex],
        code: err?.code,
      });
      setCandidateIndex(nextIndex);
      loadVideoAt(videoCandidates, nextIndex);
      return;
    }

    setError(errorMsg);
    console.warn('Video load warning:', {
      code: err?.code,
      message: errorMsg,
      url: resolvedVideoUrl,
      candidates: videoCandidates,
    });
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
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      setCurrentPlaybackTime(t);
    }
  };

  // Handle metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setError(null);
      setCurrentPlaybackTime(videoRef.current.currentTime || 0);

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
      setCurrentPlaybackTime(time);
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
    setCurrentPlaybackTime(target);
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
              <p className="mt-1 text-[10px] text-text-tertiary break-all">{resolvedVideoUrl}</p>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full flex items-center justify-center">
            <video
              ref={bindVideoRef}
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
