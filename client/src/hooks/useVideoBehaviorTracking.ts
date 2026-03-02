import { useEffect, useRef, useCallback, useState } from 'react';
import { videoBehaviorApi } from '@/services/video-behavior.api';
import {
  VideoEventType,
  VideoActionContext,
  VideoTrackingState,
  VideoSession,
  VideoBookmark,
  VideoNote,
  VideoHighlight,
  CreateBookmarkDto,
  CreateNoteDto,
  CreateHighlightDto,
} from '@/types/video-behavior';

export interface UseVideoBehaviorTrackingOptions {
  videoId: string;
  enabled?: boolean;
  context?: VideoActionContext;
  batchInterval?: number; // ms, default 5000
  maxBatchSize?: number; // default 10
  onSessionCreated?: (session: VideoSession) => void;
  onSessionEnded?: (session: VideoSession) => void;
}

interface UseVideoBehaviorTrackingReturn {
  sessionId: string | null;
  isTracking: boolean;
  trackEvent: (eventType: VideoEventType, data?: Partial<VideoTrackingState>) => Promise<void>;
  createBookmark: (data: Omit<CreateBookmarkDto, 'videoId' | 'context'>) => Promise<VideoBookmark>;
  createNote: (data: Omit<CreateNoteDto, 'videoId'>) => Promise<VideoNote>;
  createHighlight: (data: Omit<CreateHighlightDto, 'videoId'>) => Promise<VideoHighlight>;
  endSession: (finalPosition: number) => Promise<void>;
  bookmarks: VideoBookmark[];
  notes: VideoNote[];
  highlights: VideoHighlight[];
  loadingBookmarks: boolean;
  loadingNotes: boolean;
  loadingHighlights: boolean;
  refreshBookmarks: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  refreshHighlights: () => Promise<void>;
}

export function useVideoBehaviorTracking(
  options: UseVideoBehaviorTrackingOptions,
): UseVideoBehaviorTrackingReturn {
  const {
    videoId,
    enabled = true,
    context = VideoActionContext.NORMAL,
    batchInterval = 5000,
    maxBatchSize = 10,
    onSessionCreated,
    onSessionEnded,
  } = options;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [highlights, setHighlights] = useState<VideoHighlight[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  // Tracking state
  const trackingStateRef = useRef<VideoTrackingState>({
    sessionId: null,
    isPlaying: false,
    currentTime: 0,
    previousTime: 0,
    playbackRate: 1,
    volume: 1,
    context,
    lastEventTime: 0,
  });

  // Event batching
  const eventQueueRef = useRef<any[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Device info (cached)
  const deviceInfoRef = useRef<{
    deviceId: string;
    userAgent: string;
  }>({
    deviceId: '',
    userAgent: '',
  });

  // Initialize device info
  useEffect(() => {
    let deviceId = localStorage.getItem('video_tracking_device_id');
    if (!deviceId) {
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2)}`;
      localStorage.setItem('video_tracking_device_id', deviceId);
    }
    deviceInfoRef.current = {
      deviceId,
      userAgent: navigator.userAgent,
    };
  }, []);

  // Get or create session
  useEffect(() => {
    if (!enabled || !videoId) return;

    const initializeSession = async () => {
      try {
        const activeSession = await videoBehaviorApi.getActiveSession(videoId);
        if (activeSession) {
          setSessionId(activeSession.sessionId);
          trackingStateRef.current.sessionId = activeSession.sessionId;
          onSessionCreated?.(activeSession);
        }
        setIsTracking(true);
      } catch (error) {
        console.error('Failed to initialize tracking session:', error);
      }
    };

    initializeSession();
  }, [enabled, videoId, onSessionCreated]);

  // Flush event queue
  const flushEvents = useCallback(async () => {
    if (eventQueueRef.current.length === 0) return;

    const eventsToSend = [...eventQueueRef.current];
    eventQueueRef.current = [];

    try {
      await videoBehaviorApi.trackBulkEvents(eventsToSend);
    } catch (error) {
      console.error('Failed to send behavior events:', error);
      // Re-queue failed events
      eventQueueRef.current.unshift(...eventsToSend);
    }
  }, []);

  // Start batch timer
  useEffect(() => {
    if (!isTracking) return;

    batchTimerRef.current = setInterval(() => {
      flushEvents();
    }, batchInterval);

    return () => {
      if (batchTimerRef.current) {
        clearInterval(batchTimerRef.current);
      }
    };
  }, [isTracking, batchInterval, flushEvents]);

  // Track single event
  const trackEvent = useCallback(
    async (eventType: VideoEventType, data?: Partial<VideoTrackingState>) => {
      if (!enabled || !videoId) return;

      const now = Date.now();
      const state = trackingStateRef.current;
      const currentTime = data?.currentTime ?? state.currentTime;

      const eventData = {
        videoId,
        eventType,
        context,
        sessionId: state.sessionId ?? undefined,
        previousTime: state.previousTime,
        currentTime,
        playbackRate: data?.playbackRate ?? state.playbackRate,
        volume: data?.volume ?? state.volume,
        metadata: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        ...deviceInfoRef.current,
      };

      // Update state
      trackingStateRef.current = {
        ...state,
        ...data,
        previousTime: currentTime,
        lastEventTime: now,
      };

      // Add to queue
      eventQueueRef.current.push(eventData);

      // Immediate flush for important events or when queue is full
      if (
        [VideoEventType.END, VideoEventType.ERROR, VideoEventType.BOOKMARK_ADD].includes(
          eventType,
        ) ||
        eventQueueRef.current.length >= maxBatchSize
      ) {
        await flushEvents();
      }
    },
    [enabled, videoId, context, maxBatchSize, flushEvents],
  );

  // Create bookmark
  const createBookmark = useCallback(
    async (data: Omit<CreateBookmarkDto, 'videoId' | 'context'>) => {
      const bookmark = await videoBehaviorApi.createBookmark({
        ...data,
        videoId,
        context,
      });
      setBookmarks((prev) => [...prev, bookmark]);
      await trackEvent(VideoEventType.BOOKMARK_ADD);
      return bookmark;
    },
    [videoId, context, trackEvent],
  );

  // Create note
  const createNote = useCallback(
    async (data: Omit<CreateNoteDto, 'videoId'>) => {
      const note = await videoBehaviorApi.createNote({
        ...data,
        videoId,
      });
      setNotes((prev) => [...prev, note]);
      await trackEvent(VideoEventType.NOTE_ADD);
      return note;
    },
    [videoId, trackEvent],
  );

  // Create highlight
  const createHighlight = useCallback(
    async (data: Omit<CreateHighlightDto, 'videoId'>) => {
      const highlight = await videoBehaviorApi.createHighlight({
        ...data,
        videoId,
      });
      setHighlights((prev) => [...prev, highlight]);
      await trackEvent(VideoEventType.HIGHLIGHT_ADD);
      return highlight;
    },
    [videoId, trackEvent],
  );

  // End session
  const endSession = useCallback(
    async (finalPosition: number) => {
      if (!sessionId) return;

      try {
        const session = await videoBehaviorApi.endSession(sessionId, finalPosition);
        onSessionEnded?.(session);
        setSessionId(null);
        trackingStateRef.current.sessionId = null;
        setIsTracking(false);
      } catch (error) {
        console.error('Failed to end session:', error);
      }
    },
    [sessionId, onSessionEnded],
  );

  // Refresh bookmarks
  const refreshBookmarks = useCallback(async () => {
    if (!videoId) return;
    setLoadingBookmarks(true);
    try {
      const data = await videoBehaviorApi.listBookmarks(videoId);
      setBookmarks(data);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      setLoadingBookmarks(false);
    }
  }, [videoId]);

  // Refresh notes
  const refreshNotes = useCallback(async () => {
    if (!videoId) return;
    setLoadingNotes(true);
    try {
      const data = await videoBehaviorApi.listNotes(videoId);
      setNotes(data);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoadingNotes(false);
    }
  }, [videoId]);

  // Refresh highlights
  const refreshHighlights = useCallback(async () => {
    if (!videoId) return;
    setLoadingHighlights(true);
    try {
      const data = await videoBehaviorApi.listHighlights(videoId);
      setHighlights(data);
    } catch (error) {
      console.error('Failed to load highlights:', error);
    } finally {
      setLoadingHighlights(false);
    }
  }, [videoId]);

  // Load initial data
  useEffect(() => {
    if (!enabled || !videoId) return;
    refreshBookmarks();
    refreshNotes();
    refreshHighlights();
  }, [enabled, videoId, refreshBookmarks, refreshNotes, refreshHighlights]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearInterval(batchTimerRef.current);
      }
      // Flush remaining events
      flushEvents();
    };
  }, [flushEvents]);

  return {
    sessionId,
    isTracking,
    trackEvent,
    createBookmark,
    createNote,
    createHighlight,
    endSession,
    bookmarks,
    notes,
    highlights,
    loadingBookmarks,
    loadingNotes,
    loadingHighlights,
    refreshBookmarks,
    refreshNotes,
    refreshHighlights,
  };
}
