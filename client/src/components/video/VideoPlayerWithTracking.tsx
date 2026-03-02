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
}

export const VideoPlayerWithTracking: React.FC<VideoPlayerWithTrackingProps> = ({
  videoId,
  videoUrl,
  context = VideoActionContext.NORMAL,
  className = '',
  onBookmark,
  onNote,
  onHighlight,
}) => {
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
    onPause: () => console.log('Video paused'),
    onSeek: (time) => console.log('Seeked to', time),
    onEnd: () => console.log('Video ended'),
  });

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
