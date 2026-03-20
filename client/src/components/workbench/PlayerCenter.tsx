'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { getToken } from '@/services/api';
import { videoApi } from '@/services/video.api';
import { videoBehaviorApi } from '@/services/video-behavior.api';
import { useVideoBehaviorTracking } from '@/hooks/useVideoBehaviorTracking';
import { VideoEventType, VideoActionContext } from '@/types/video-behavior';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:7870');

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
  const lastSeekCommitRef = useRef<{ at: number; time: number } | null>(null);
  const suppressPlaybackTrackUntilRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState('');
  const [videoCandidates, setVideoCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [resumeHint, setResumeHint] = useState<number | null>(null);

  const bindVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (externalVideoRef) {
      (externalVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const clampToDuration = (time: number) =>
    Math.max(0, Math.min(time, Number.isFinite(duration) && duration > 0 ? duration : time));

  const buildVideoCandidates = async (video: typeof currentVideo) => {
    if (!video) return [] as string[];
    const token = getToken();
    const urls: string[] = [];
    const fallbackUrls: string[] = [];

    if (video.id) {
      try {
        const play = await videoApi.getPlayUrl(video.id);
        if (play?.url) urls.push(play.url);
      } catch {
        console.warn('Failed to get signed play url, continue fallback candidates');
      }
    }

    if (
      video.videoUrl &&
      (video.videoUrl.startsWith('http://') || video.videoUrl.startsWith('https://'))
    ) {
      urls.push(video.videoUrl);
    }

    if (
      video.sourceUrl &&
      (video.sourceUrl.startsWith('http://') || video.sourceUrl.startsWith('https://'))
    ) {
      urls.push(video.sourceUrl);
    }

    const relativePath = video.videoUrl || video.storagePath || '';
    if (relativePath) {
      const baseUrl = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
      const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
      const separator = path.includes('?') ? '&' : '?';
      urls.push(`${baseUrl}${path}${separator}token=${encodeURIComponent(token || '')}`);
    }

    if (video.sourceType === 'LOCAL_UPLOAD' && video.id) {
      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const qs = new URLSearchParams();
      if (token) qs.set('token', token);
      qs.set('_ts', video.updatedAt || video.createdAt || '');
      fallbackUrls.push(`${base}/api/videos/${video.id}/stream?${qs.toString()}`);
    }

    return Array.from(new Set([...urls.filter(Boolean), ...fallbackUrls.filter(Boolean)]));
  };

  const loadVideoAt = (urls: string[], index: number) => {
    if (!videoRef.current) return;
    const target = urls[index] || '';
    setResolvedVideoUrl(target);
    videoRef.current.src = target;
    videoRef.current.load();
  };

  const commitSeek = (time: number) => {
    if (!videoRef.current) return;
    const target = clampToDuration(time);
    const previousTime = videoRef.current.currentTime;
    if (Math.abs(previousTime - target) < 0.05) {
      setCurrentTime(target);
      setScrubTime(target);
      setCurrentPlaybackTime(target);
      return;
    }
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    setScrubTime(target);
    setCurrentPlaybackTime(target);
    suppressPlaybackTrackUntilRef.current = Date.now() + 400;
    tracking.trackEvent(VideoEventType.SEEK, {
      previousTime,
      currentTime: target,
    });
  };

  const seekBy = (offset: number) => {
    if (!videoRef.current) return;
    commitSeek((videoRef.current.currentTime || 0) + offset);
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!videoRef.current || !currentVideo) {
        setResolvedVideoUrl('');
        setVideoCandidates([]);
        setCandidateIndex(0);
        setResumeHint(null);
        return;
      }

      setError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setScrubTime(0);
      setDuration(0);
      setResumeHint(null);

      const candidates = await buildVideoCandidates(currentVideo);
      if (cancelled) return;

      setVideoCandidates(candidates);
      setCandidateIndex(0);

      if (candidates.length > 0) {
        loadVideoAt(candidates, 0);
      } else {
        setError('未找到可播放的视频地址');
      }

      try {
        const progress = await videoBehaviorApi.getUserVideoProgress(currentVideo.id);
        if (cancelled) return;
        const lastPosition = Number(progress?.lastPosition ?? 0);
        if (lastPosition > 3) {
          pendingSeekRef.current = lastPosition;
          setResumeHint(lastPosition);
        }
      } catch {
        // Best effort only.
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [currentVideo]);

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
  }, [tracking]);

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

    commitSeek(seekRequest.timestamp);
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest]);

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
      setCandidateIndex(nextIndex);
      loadVideoAt(videoCandidates, nextIndex);
      return;
    }

    setError(errorMsg);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const next = videoRef.current.currentTime;
    if (!isScrubbing) {
      setCurrentTime(next);
      setScrubTime(next);
      setCurrentPlaybackTime(next);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setPlaybackRate(videoRef.current.playbackRate || 1);
    setVolume(videoRef.current.volume ?? 1);
    setIsMuted(videoRef.current.muted);
    setError(null);

    if (pendingSeekRef.current !== null) {
      const target = pendingSeekRef.current;
      pendingSeekRef.current = null;
      commitSeek(target);
    }
  };

  const handleSeekInput = (value: number) => {
    const next = Number.isFinite(value) ? value : 0;
    setScrubTime(next);
  };

  const handleSeekCommit = (value?: number) => {
    const next = clampToDuration(value ?? scrubTime);
    const now = Date.now();
    const lastCommit = lastSeekCommitRef.current;
    const duplicateCommit =
      lastCommit &&
      now - lastCommit.at < 1200 &&
      Math.abs(lastCommit.time - next) < 0.25;

    if (duplicateCommit) {
      setIsScrubbing(false);
      return;
    }

    if (!isScrubbing && Math.abs(next - currentTime) < 0.05) {
      return;
    }

    lastSeekCommitRef.current = { at: now, time: next };
    setIsScrubbing(false);
    commitSeek(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    if (!videoRef.current) return;
    videoRef.current.volume = next;
    videoRef.current.muted = next === 0;
    setVolume(next);
    setIsMuted(next === 0);
    tracking.trackEvent(VideoEventType.VOLUME_CHANGE, {
      currentTime: videoRef.current.currentTime,
      volume: next,
    });
  };

  const handlePlaybackRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseFloat(e.target.value);
    if (!videoRef.current) return;
    videoRef.current.playbackRate = next;
    setPlaybackRate(next);
    tracking.trackEvent(VideoEventType.SPEED_CHANGE, {
      currentTime: videoRef.current.currentTime,
      playbackRate: next,
    });
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      void videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
    if (!videoRef.current.muted && videoRef.current.volume === 0) {
      videoRef.current.volume = 0.6;
      setVolume(0.6);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (!isFullscreen) {
      void videoRef.current.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const togglePictureInPicture = async () => {
    const player = videoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    if (!player) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && player.requestPictureInPicture) {
        await player.requestPictureInPicture();
        tracking.trackEvent(VideoEventType.PICTURE_IN_PICTURE, {
          currentTime: player.currentTime,
        });
      }
    } catch {
      // Unsupported or blocked.
    }
  };

  if (!currentVideo) {
    return (
      <div className="panel flex flex-1 min-h-0 flex-col rounded-none border-x-0 border-t-0">
        <div className="flex flex-1 items-center justify-center bg-bg-panel-tertiary">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-bg-panel-secondary">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-text-tertiary opacity-30"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-text-secondary">选择左侧视频开始播放</p>
          </div>
        </div>

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
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel flex h-full min-h-[220px] flex-col overflow-hidden rounded-none border-x-0 border-t-0"
      style={{ minHeight: MIN_PLAYER_HEIGHT }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
        <h3 className="wb-section-title truncate pr-2">{currentVideo.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {currentVideo.resolution ? (
            <span className="wb-meta tabular-nums">{currentVideo.resolution}</span>
          ) : null}
          {currentVideo.thumbnailUrl ? (
            <span className="status-dot status-dot-success" title="已生成缩略图" />
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mx-auto mb-2 text-red-400"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <p className="text-xs text-text-secondary">{error}</p>
              <p className="mt-1 break-all text-[10px] text-text-tertiary">{resolvedVideoUrl}</p>
            </div>
          </div>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <video
              ref={bindVideoRef}
              className="max-h-full max-w-full object-contain"
              style={{ aspectRatio: '16/9' }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              onPlay={() => {
                setIsPlaying(true);
                if (Date.now() < suppressPlaybackTrackUntilRef.current) {
                  return;
                }
                tracking.trackEvent(VideoEventType.PLAY, {
                  currentTime: videoRef.current?.currentTime ?? 0,
                });
              }}
              onPause={() => {
                setIsPlaying(false);
                if (Date.now() < suppressPlaybackTrackUntilRef.current) {
                  return;
                }
                tracking.trackEvent(VideoEventType.PAUSE, {
                  currentTime: videoRef.current?.currentTime ?? 0,
                });
              }}
              onVolumeChange={() => {
                setVolume(videoRef.current?.volume ?? 1);
                setIsMuted(videoRef.current?.muted ?? false);
              }}
              onEnded={() => {
                tracking.trackEvent(VideoEventType.END, {
                  currentTime: videoRef.current?.duration ?? 0,
                });
                void tracking.endSession(videoRef.current?.duration ?? 0);
              }}
              controls={false}
              playsInline
              crossOrigin="anonymous"
            />

            {resumeHint !== null && !isPlaying && currentTime < 1 ? (
              <button
                type="button"
                onClick={() => {
                  commitSeek(resumeHint);
                  setResumeHint(null);
                }}
                className="absolute right-4 top-4 rounded-full border border-border-subtle bg-black/60 px-3 py-1 text-xs text-white backdrop-blur transition hover:border-border-default hover:bg-black/75"
              >
                从 {formatTime(resumeHint)} 继续播放
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-panel-secondary px-3">
        <button
          onClick={() => seekBy(-10)}
          className="shrink-0 text-text-tertiary transition hover:text-text-secondary"
          title="后退 10 秒"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19l-7-7 7-7" />
            <path d="M18 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={togglePlay}
          className="shrink-0 text-text-tertiary transition hover:text-text-secondary"
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

        <button
          onClick={() => seekBy(10)}
          className="shrink-0 text-text-tertiary transition hover:text-text-secondary"
          title="前进 10 秒"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 5l7 7-7 7" />
            <path d="M13 5l7 7-7 7" />
          </svg>
        </button>

        <span className="shrink-0 text-[11px] font-mono tabular-nums text-text-tertiary">
          {formatTime(isScrubbing ? scrubTime : currentTime)} / {formatTime(duration)}
        </span>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) && duration > 0 ? duration : 0}
            step="0.01"
            value={isScrubbing ? scrubTime : currentTime}
            aria-label="视频进度"
            onPointerDown={() => {
              if (!Number.isFinite(duration) || duration <= 0) return;
              setIsScrubbing(true);
            }}
            onChange={(event) => {
              handleSeekInput(parseFloat(event.currentTarget.value));
              if (!isScrubbing) {
                setIsScrubbing(true);
              }
            }}
            onPointerUp={(event) => {
              handleSeekCommit(parseFloat(event.currentTarget.value));
            }}
            onKeyUp={(event) => {
              handleSeekCommit(parseFloat(event.currentTarget.value));
            }}
            onBlur={(event) => {
              if (isScrubbing) {
                handleSeekCommit(parseFloat(event.currentTarget.value));
              }
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-panel-tertiary accent-accent-primary"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-text-tertiary transition hover:text-text-secondary"
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted || volume === 0 ? (
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

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-bg-panel-tertiary accent-accent-primary"
          />
        </div>

        <select
          value={String(playbackRate)}
          onChange={handlePlaybackRateChange}
          className="h-7 rounded-md border border-border-subtle bg-bg-panel px-2 text-[11px] text-text-secondary outline-none transition focus:border-border-default"
          title="播放速度"
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>

        <button
          onClick={togglePictureInPicture}
          className="shrink-0 text-text-tertiary transition hover:text-text-secondary"
          title="画中画"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <rect x="12" y="10" width="6" height="4" rx="1" />
          </svg>
        </button>

        <button
          onClick={toggleFullscreen}
          className="shrink-0 text-text-tertiary transition hover:text-text-secondary"
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
