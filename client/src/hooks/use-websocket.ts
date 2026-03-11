'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Event types
interface TaskProgressEvent {
  projectId: string;
  videoId?: string;
  nodeId?: string;
  translationTaskId?: string;
  assetId?: string;
  task: string;
  progress: number;
  message: string;
  timestamp: string;
}

interface TaskErrorEvent {
  projectId: string;
  videoId?: string;
  nodeId?: string;
  translationTaskId?: string;
  assetId?: string;
  task: string;
  error: string;
  timestamp: string;
}

interface TaskCompleteEvent {
  projectId: string;
  task: string;
  result?: any;
  timestamp: string;
}

interface PrismActionEvent {
  projectId: string;
  prismType: 'knowledge' | 'creation' | 'translation' | 'diffraction';
  action: string;
  payload?: any;
  timestamp: string;
}

interface ChatMessageEvent {
  projectId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  timestamp: string;
}

interface KnowledgeStateEvent {
  projectId: string;
  videoId: string;
  taskId?: string;
  state: 'idle' | 'analyzing' | 'streaming' | 'ready' | 'syncing' | 'synced' | 'failed';
  message?: string;
  stats?: Record<string, unknown>;
  timestamp: string;
}

interface KnowledgeTimelineEvent {
  projectId: string;
  videoId: string;
  taskId?: string;
  item: {
    id: string;
    type: 'KEYFRAME_CARD' | 'OUTLINE_BLOCK' | 'QA_CARD' | 'FLASHCARD' | 'REVIEW_PLAN';
    timestampSec?: number;
    title: string;
    summary?: string;
    content?: string;
    imageUrl?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  };
  timestamp: string;
}

interface UseWebSocketOptions {
  projectId?: string;
  onTaskProgress?: (event: TaskProgressEvent) => void;
  onTaskError?: (event: TaskErrorEvent) => void;
  onTaskComplete?: (event: TaskCompleteEvent) => void;
  onPrismAction?: (event: PrismActionEvent) => void;
  onChatMessage?: (event: ChatMessageEvent) => void;
  onKnowledgeState?: (event: KnowledgeStateEvent) => void;
  onKnowledgeTimeline?: (event: KnowledgeTimelineEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinProject: (projectId: string) => void;
  leaveProject: (projectId: string) => void;
  emit: (event: string, data: any) => void;
  disconnect: () => void;
}

/**
 * WebSocket Hook for real-time communication
 *
 * @example
 * const { socket, isConnected, joinProject } = useWebSocket({
 *   projectId: 'xxx',
 *   onTaskProgress: (e) => console.log('Progress:', e.progress),
 * });
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    projectId: initialProjectId,
    onTaskProgress,
    onTaskError,
    onTaskComplete,
    onPrismAction,
    onChatMessage,
    onKnowledgeState,
    onKnowledgeTimeline,
    onConnected,
    onDisconnected,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentProjectRef = useRef<string | undefined>(initialProjectId);
  const callbacksRef = useRef({
    onTaskProgress,
    onTaskError,
    onTaskComplete,
    onPrismAction,
    onChatMessage,
    onKnowledgeState,
    onKnowledgeTimeline,
    onConnected,
    onDisconnected,
    onError,
  });

  // Get WebSocket URL from environment
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    ? `${process.env.NEXT_PUBLIC_WS_URL.replace(/^http/, 'ws')}/ws`
    : typeof window !== 'undefined'
      ? `${window.location.origin.replace(/^http/, 'ws')}/ws`
      : 'ws://127.0.0.1:7860/ws';

  useEffect(() => {
    callbacksRef.current = {
      onTaskProgress,
      onTaskError,
      onTaskComplete,
      onPrismAction,
      onChatMessage,
      onKnowledgeState,
      onKnowledgeTimeline,
      onConnected,
      onDisconnected,
      onError,
    };
  }, [
    onTaskProgress,
    onTaskError,
    onTaskComplete,
    onPrismAction,
    onChatMessage,
    onKnowledgeState,
    onKnowledgeTimeline,
    onConnected,
    onDisconnected,
    onError,
  ]);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('No auth token found, skipping WebSocket connection');
      return;
    }

    const socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setIsConnected(true);
      callbacksRef.current.onConnected?.();

      // Auto-join project if provided
      if (currentProjectRef.current) {
        socket.emit('join:project', { projectId: currentProjectRef.current });
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      callbacksRef.current.onDisconnected?.();
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      callbacksRef.current.onError?.(error as Error);
    });

    socket.on('connected', (data) => {
      console.log('WebSocket server confirmed connection:', data);
    });

    // Task events
    socket.on('task:progress', (event: TaskProgressEvent) => {
      callbacksRef.current.onTaskProgress?.(event);
    });

    socket.on('task:error', (event: TaskErrorEvent) => {
      callbacksRef.current.onTaskError?.(event);
    });

    socket.on('task:complete', (event: TaskCompleteEvent) => {
      callbacksRef.current.onTaskComplete?.(event);
    });

    // Prism events
    socket.on('prism:action', (event: PrismActionEvent) => {
      callbacksRef.current.onPrismAction?.(event);
    });

    // Chat events
    socket.on('chat:message', (event: ChatMessageEvent) => {
      callbacksRef.current.onChatMessage?.(event);
    });

    socket.on('knowledge:state', (event: KnowledgeStateEvent) => {
      callbacksRef.current.onKnowledgeState?.(event);
    });

    socket.on('knowledge:timeline', (event: KnowledgeTimelineEvent) => {
      callbacksRef.current.onKnowledgeTimeline?.(event);
    });

    // Join/Leave confirmation
    socket.on('joined:project', (data) => {
      console.log('Joined project room:', data.projectId);
    });

    socket.on('left:project', (data) => {
      console.log('Left project room:', data.projectId);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [wsUrl]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;

    const previousProjectId = currentProjectRef.current;
    if (previousProjectId && previousProjectId !== initialProjectId) {
      socket.emit('leave:project', { projectId: previousProjectId });
    }

    if (initialProjectId && previousProjectId !== initialProjectId) {
      socket.emit('join:project', { projectId: initialProjectId });
    }

    currentProjectRef.current = initialProjectId;
  }, [initialProjectId, isConnected]);

  // Join a project room
  const joinProject = useCallback((projectId: string) => {
    const socket = socketRef.current;
    if (socket && isConnected) {
      socket.emit('join:project', { projectId });
      currentProjectRef.current = projectId;
    }
  }, [isConnected]);

  // Leave a project room
  const leaveProject = useCallback((projectId: string) => {
    const socket = socketRef.current;
    if (socket && isConnected) {
      socket.emit('leave:project', { projectId });
      if (currentProjectRef.current === projectId) {
        currentProjectRef.current = undefined;
      }
    }
  }, [isConnected]);

  // Emit a custom event
  const emit = useCallback((event: string, data: any) => {
    const socket = socketRef.current;
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [isConnected]);

  // Manual disconnect
  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.disconnect();
      socketRef.current = null;
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinProject,
    leaveProject,
    emit,
    disconnect,
  };
}

/**
 * Simplified hook for task progress monitoring
 */
export function useTaskProgress(taskType: string, assetId?: string) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleProgress = useCallback((event: TaskProgressEvent) => {
    if (event.task === taskType && (!assetId || event.videoId === assetId || event.nodeId === assetId)) {
      setProgress(event.progress);
      setMessage(event.message);
      setStatus('running');
    }
  }, [taskType, assetId]);

  const handleError = useCallback((event: TaskErrorEvent) => {
    if (event.task === taskType && (!assetId || event.videoId === assetId || event.nodeId === assetId)) {
      setError(event.error);
      setStatus('error');
    }
  }, [taskType, assetId]);

  const handleComplete = useCallback((event: TaskCompleteEvent) => {
    if (event.task === taskType) {
      setStatus('completed');
      setProgress(100);
    }
  }, [taskType]);

  return {
    progress,
    message,
    status,
    error,
    handleProgress,
    handleError,
    handleComplete,
    reset: () => {
      setProgress(0);
      setMessage('');
      setStatus('idle');
      setError(null);
    },
  };
}
