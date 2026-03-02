import { useEffect, useRef, useCallback, useState } from 'react';
import { useVideoBehaviorTracking, UseVideoBehaviorTrackingOptions } from './useVideoBehaviorTracking';
import { VideoEventType, VideoActionContext } from '@/types/video-behavior';

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isPiP: boolean;
  buffered: number[];
}

export interface VideoPlayerControls {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  enterPiP: () => Promise<void>;
  exitPiP: () => Promise<void>;
}

interface UseVideoPlayerWithTrackingOptions extends UseVideoBehaviorTrackingOptions {
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onRateChange?: (rate: number) => void;
  onVolumeChange?: (volume: number) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onTimeUpdate?: (time: number) => void;
  onProgress?: (buffered: number[]) => void;
}

export function useVideoPlayerWithTracking(
  options: UseVideoPlayerWithTrackingOptions,
) {
  const tracking = useVideoBehaviorTracking(options);

  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    isPiP: false,
    buffered: [],
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTrackedTimeRef = useRef(0);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update player state from video element
  const updatePlayerState = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerState({
      isPlaying: !video.paused,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      playbackRate: video.playbackRate,
      volume: video.volume,
      isMuted: video.muted,
      isFullscreen: document.fullscreenElement !== null,
      isPiP: document.pictureInPictureElement !== null,
      buffered: getTimeRanges(video.buffered),
    });
  }, []);

  // Get time ranges as array
  function getTimeRanges(ranges: TimeRanges): number[] {
    const result: number[] = [];
    for (let i = 0; i < ranges.length; i++) {
      result.push(ranges.start(i), ranges.end(i));
    }
    return result;
  }

  // Play
  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      await video.play();
    } catch (error) {
      console.error('Failed to play video:', error);
      options.onError?.(error as Error);
    }
  }, [options]);

  // Pause
  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
  }, []);

  // Seek
  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    const previousTime = video.currentTime;
    video.currentTime = time;

    tracking.trackEvent(VideoEventType.SEEK, {
      currentTime: time,
      previousTime,
    });
  }, [tracking]);

  // Set playback rate
  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = rate;

    tracking.trackEvent(VideoEventType.SPEED_CHANGE, {
      playbackRate: rate,
    });
  }, [tracking]);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume;

    tracking.trackEvent(VideoEventType.VOLUME_CHANGE, {
      volume,
    });
  }, [tracking]);

  // Set muted
  const setMuted = useCallback((muted: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
  }, []);

  // Enter fullscreen
  const enterFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.requestFullscreen) {
      video.requestFullscreen();
    }

    tracking.trackEvent(VideoEventType.FULLSCREEN);
  }, [tracking]);

  // Exit fullscreen
  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  // Enter Picture-in-Picture
  const enterPiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        tracking.trackEvent(VideoEventType.PICTURE_IN_PICTURE);
      }
    } catch (error) {
      console.error('Failed to enter PiP:', error);
    }
  }, [tracking]);

  // Exit Picture-in-Picture
  const exitPiP = useCallback(async () => {
    if (document.exitPictureInPicture) {
      await document.exitPictureInPicture();
    }
  }, []);

  // Setup video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      updatePlayerState();
      tracking.trackEvent(VideoEventType.PLAY, {
        currentTime: video.currentTime,
      });
      options.onPlay?.();
    };

    const handlePause = () => {
      updatePlayerState();
      tracking.trackEvent(VideoEventType.PAUSE, {
        currentTime: video.currentTime,
        previousTime: lastTrackedTimeRef.current,
      });
      lastTrackedTimeRef.current = video.currentTime;
      options.onPause?.();
    };

    const handleSeeking = () => {
      updatePlayerState();
    };

    const handleSeeked = () => {
      updatePlayerState();
      options.onSeek?.(video.currentTime);
    };

    const handleRateChange = () => {
      updatePlayerState();
      options.onRateChange?.(video.playbackRate);
    };

    const handleVolumeChange = () => {
      updatePlayerState();
      options.onVolumeChange?.(video.volume);
    };

    const handleEnded = () => {
      updatePlayerState();
      tracking.trackEvent(VideoEventType.END, {
        currentTime: video.duration,
      });
      tracking.endSession(video.duration);
      options.onEnd?.();
    };

    const handleError = () => {
      tracking.trackEvent(VideoEventType.ERROR, {
        currentTime: video.currentTime,
      });
      options.onError?.(new Error('Video playback error'));
    };

    const handleTimeUpdate = () => {
      options.onTimeUpdate?.(video.currentTime);
    };

    const handleProgress = () => {
      updatePlayerState();
      options.onProgress?.(getTimeRanges(video.buffered));
    };

    const handleDurationChange = () => {
      updatePlayerState();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('durationchange', handleDurationChange);

    // Track initial state
    updatePlayerState();

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('durationchange', handleDurationChange);
    };
  }, [tracking, updatePlayerState, options]);

  // Periodic time tracking for play events
  useEffect(() => {
    if (!playerState.isPlaying) {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      return;
    }

    trackingIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        lastTrackedTimeRef.current = video.currentTime;
      }
    }, 5000); // Track every 5 seconds during playback

    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
    };
  }, [playerState.isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerState.isPlaying && tracking.sessionId) {
        // End session if video is playing
        tracking.endSession(playerState.currentTime);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controls: VideoPlayerControls = {
    play,
    pause,
    seek,
    setPlaybackRate,
    setVolume,
    setMuted,
    enterFullscreen,
    exitFullscreen,
    enterPiP,
    exitPiP,
  };

  return {
    videoRef,
    playerState,
    controls,
    ...tracking,
  };
}
