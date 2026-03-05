import React, { useRef, useEffect } from 'react';
import { useVideoPlayerWithTracking } from '@/hooks/useVideoPlayerWithTracking';
import { VideoActionContext } from '@/types/video-behavior';
import { Play, Pause, Volume2, Maximize, Minimize } from 'lucide-react';

interface VideoPlayerWithTrackingProps {
  videoId: string;
  videoUrl: string;
  context?: VideoActionContext;
  className?: string;
  onBookmark?: () => void;
  onNote?: () => void;
  onHighlight?: () => void;
  // 画面分析相关回调
  onPauseForAnalysis?: (timestamp: number) => void;
  onSeekForAnalysis?: (fromTime: number, toTime: number) => void;
  onRegionClick?: (clicks: Array<{x: number; y: number; timestamp: number}>) => void;
}

export const VideoPlayerWithTracking: React.FC<VideoPlayerWithTrackingProps> = ({
  videoId,
  videoUrl,
  context = VideoActionContext.NORMAL,
  className = '',
  onBookmark,
  onNote,
  onHighlight,
  onPauseForAnalysis,
  onSeekForAnalysis,
  onRegionClick,
}) => {
  // 区域点击跟踪状态
  const [regionClicks, setRegionClicks] = React.useState<Array<{x: number; y: number; timestamp: number}>>([]);
  const [clickTimeout, setClickTimeout] = React.useState<NodeJS.Timeout | null>(null);

  const {
    videoRef,
    playerState,
    controls,
    bookmarks,
    notes,
    highlights,
    createBookmark,
    createNote,
    createHighlight,
  } = useVideoPlayerWithTracking({
    videoId,
    context,
    enabled: true,
    batchInterval: 5000,
    maxBatchSize: 10,
    onPlay: () => console.log('Video played'),
    onPause: () => {
      console.log('Video paused');
      onPauseForAnalysis?.(playerState.currentTime);
    },
    onSeek: (time) => {
      console.log('Seeked to', time);
      // 跳跃超过 5 秒才触发分析
      const previousTime = playerState.currentTime;
      if (Math.abs(time - previousTime) > 5) {
        onSeekForAnalysis?.(previousTime, time);
      }
    },
    onEnd: () => console.log('Video ended'),
  });

  // 清理点击 timeout
  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [clickTimeout]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBookmark = async () => {
    try {
      await createBookmark({
        timestamp: playerState.currentTime,
        title: `Bookmark at ${formatTime(playerState.currentTime)}`,
      });
      onBookmark?.();
    } catch (error) {
      console.error('Failed to create bookmark:', error);
    }
  };

  const handleNote = async () => {
    const content = prompt('Enter note content:');
    if (content) {
      try {
        await createNote({
          timestamp: playerState.currentTime,
          content,
          isMarkdown: true,
        });
        onNote?.();
      } catch (error) {
        console.error('Failed to create note:', error);
      }
    }
  };

  const handleHighlight = async () => {
    const title = prompt('Enter highlight title:');
    if (title) {
      try {
        await createHighlight({
          startTime: playerState.currentTime,
          endTime: Math.min(playerState.currentTime + 30, playerState.duration),
          title,
        });
        onHighlight?.();
      } catch (error) {
        console.error('Failed to create highlight:', error);
      }
    }
  };

  // 处理视频画面点击，用于区域分析
  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const timestamp = playerState.currentTime;

    // 清理之前的 timeout
    if (clickTimeout) {
      clearTimeout(clickTimeout);
    }

    // 添加新点击
    const newClicks = [...regionClicks, { x, y, timestamp }];
    setRegionClicks(newClicks);

    // 设置新的 timeout，如果 2 秒内没有更多点击则重置
    const timeoutId = setTimeout(() => {
      setRegionClicks([]);
    }, 2000);
    setClickTimeout(timeoutId);

    // 如果累积 3 次点击，触发区域分析
    if (newClicks.length >= 3) {
      onRegionClick?.(newClicks);
      setRegionClicks([]); // 重置点击列表
    }
  };

  const progress = playerState.duration > 0
    ? (playerState.currentTime / playerState.duration) * 100
    : 0;

  return (
    <div className={`video-player-with-tracking ${className}`}>
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full"
          controls={false}
          playsInline
          onClick={handleVideoClick}
        />

        {/* Custom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="w-full h-1 bg-white/20 rounded-full mb-4 cursor-pointer">
            <div
              className="h-full bg-blue-500 rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              {/* Bookmark indicators */}
              {bookmarks.map((bookmark) => {
                const pos = (bookmark.timestamp / playerState.duration) * 100;
                return (
                  <div
                    key={bookmark.id}
                    className="absolute w-3 h-3 bg-blue-300 rounded-full -top-1 transform -translate-x-1/2 cursor-pointer"
                    style={{ left: `${pos}%` }}
                    title={bookmark.title}
                    onClick={() => controls.seek(bookmark.timestamp)}
                  />
                );
              })}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {playerState.isPlaying ? (
                <Pause
                  className="w-6 h-6 cursor-pointer hover:scale-110 transition-transform"
                  onClick={controls.pause}
                />
              ) : (
                <Play
                  className="w-6 h-6 cursor-pointer hover:scale-110 transition-transform"
                  onClick={controls.play}
                />
              )}

              <div className="flex items-center gap-1">
                <Volume2 className="w-5 h-5" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={playerState.volume}
                  onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                  className="w-20"
                />
              </div>

              <span className="text-sm text-white/80">
                {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
              </span>

              <select
                value={playerState.playbackRate}
                onChange={(e) => controls.setPlaybackRate(parseFloat(e.target.value))}
                className="bg-transparent text-sm text-white border border-white/20 rounded px-2 py-1"
              >
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Actions */}
              <button
                onClick={handleBookmark}
                className="px-3 py-1 bg-blue-500/80 hover:bg-blue-500 text-white text-sm rounded transition-colors"
              >
                Bookmark
              </button>
              <button
                onClick={handleNote}
                className="px-3 py-1 bg-green-500/80 hover:bg-green-500 text-white text-sm rounded transition-colors"
              >
                Note
              </button>
              <button
                onClick={handleHighlight}
                className="px-3 py-1 bg-orange-500/80 hover:bg-orange-500 text-white text-sm rounded transition-colors"
              >
                Highlight
              </button>

              {playerState.isFullscreen ? (
                <Minimize
                  className="w-5 h-5 cursor-pointer hover:scale-110 transition-transform"
                  onClick={controls.exitFullscreen}
                />
              ) : (
                <Maximize
                  className="w-5 h-5 cursor-pointer hover:scale-110 transition-transform"
                  onClick={controls.enterFullscreen}
                />
              )}
            </div>
          </div>
        </div>

        {/* Buffering Indicator */}
        {playerState.buffered.length > 0 && playerState.buffered[1] < playerState.duration && (
          <div className="absolute top-4 right-4 px-3 py-1 bg-yellow-500/80 text-white text-sm rounded">
            Buffering...
          </div>
        )}
      </div>

      {/* Stats Display */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
          <div className="text-gray-500 dark:text-gray-400">Bookmarks</div>
          <div className="text-2xl font-semibold">{bookmarks.length}</div>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
          <div className="text-gray-500 dark:text-gray-400">Notes</div>
          <div className="text-2xl font-semibold">{notes.length}</div>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
          <div className="text-gray-500 dark:text-gray-400">Highlights</div>
          <div className="text-2xl font-semibold">{highlights.length}</div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerWithTracking;
