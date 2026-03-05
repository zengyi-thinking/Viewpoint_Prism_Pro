'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { chatApi, type QuickPrompt } from '@/services/chat.api';
import { getToken } from '@/services/api';
import { io } from 'socket.io-client';
import { useWorkbenchStore } from '@/stores/workbench.store';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  metadata?: {
    frameImage?: string;
    frameTimestamp?: number;
    [key: string]: unknown;
  };
}

interface ChatDockProps {
  projectId?: string;
  height?: number;
  videoPlayerRef?: React.RefObject<HTMLVideoElement | null> | null;
  onFrameAnalysisRequest?: (timestamp: number, frameBase64: string) => void;
}

const DEFAULT_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'explain',
    type: 'explain',
    label: '通俗解释',
    icon: '💡',
    promptTemplate: '请用通俗易懂的方式解释当前内容，并给一个生活化例子。',
  },
  {
    id: 'summary',
    type: 'summary',
    label: '智能总结',
    icon: '📝',
    promptTemplate: '请总结核心观点和关键结论。',
  },
];

export function ChatDock({ projectId, height, videoPlayerRef, onFrameAnalysisRequest }: ChatDockProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attachPausedFrame, setAttachPausedFrame] = useState(true);
  const [frameContextMode, setFrameContextMode] = useState<'quick' | 'deep'>('quick');

  const [analyzingFrame, setAnalyzingFrame] = useState(false);
  const [regionAnalysis, setRegionAnalysis] = useState<string | null>(null);
  const activePrism = useWorkbenchStore((s) => s.activePrism);
  const currentVideo = useWorkbenchStore((s) => s.currentVideo);
  const currentPlaybackTime = useWorkbenchStore((s) => s.currentPlaybackTime);
  const prismForChat = (activePrism ?? (currentVideo ? 'knowledge' : null)) as
    | 'knowledge'
    | 'creation'
    | 'translation'
    | 'diffraction'
    | null;

  const messageListRef = useRef<HTMLDivElement>(null);

  const waitForVideoFrame = async (videoEl: HTMLVideoElement) => {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      const rvfc = (videoEl as any).requestVideoFrameCallback as
        | ((cb: (now: number, metadata: unknown) => void) => number)
        | undefined;
      if (typeof rvfc === 'function') {
        videoEl.requestVideoFrameCallback(() => finish());
      } else {
        requestAnimationFrame(() => requestAnimationFrame(() => finish()));
      }

      setTimeout(finish, 160);
    });
  };

  // 提取当前视频帧用于画面分析
  const captureCurrentFrame = async (): Promise<string | null> => {
    const videoEl = videoPlayerRef?.current;
    if (!videoEl || videoEl.readyState < 2) {
      return null; // HAVE_CURRENT_DATA
    }

    try {
      await waitForVideoFrame(videoEl);
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
      }
      return null;
    } catch (error) {
      console.error('Failed to capture frame:', error);
      return null;
    }
  };

  const getPlaybackState = () => {
    const videoEl = videoPlayerRef?.current;
    const currentTime = Number(videoEl?.currentTime ?? currentPlaybackTime ?? 0);
    const duration = Number(videoEl?.duration ?? 0);
    const isPaused = Boolean(videoEl?.paused);
    const hasDuration = Number.isFinite(duration) && duration > 0.5;
    const isMidPlayback = isPaused && currentTime > 0.5 && (!hasDuration || currentTime < duration - 0.5);

    return {
      currentTime,
      duration,
      isPaused,
      isMidPlayback,
    };
  };

  const appendMessageUnique = (incoming: Message) => {
    setMessages((prev) => {
      if (incoming.id) {
        const sameIdIndex = prev.findIndex((item) => item.id === incoming.id);
        if (sameIdIndex >= 0) {
          const existing = prev[sameIdIndex];
          const merged: Message = {
            ...existing,
            ...incoming,
            metadata: {
              ...(existing.metadata || {}),
              ...(incoming.metadata || {}),
            },
          };
          const next = [...prev];
          next[sameIdIndex] = merged;
          return next;
        }
      }

      const normalizedIncoming = incoming.content.trim();
      const incomingTs = Number(incoming.metadata?.frameTimestamp ?? -1);
      const duplicateIndex = prev.findIndex(
        (item) => {
          if (item.role !== incoming.role) return false;
          if (item.content.trim() !== normalizedIncoming) return false;
          const dt =
            Math.abs(
              new Date(item.createdAt || Date.now()).getTime() -
                new Date(incoming.createdAt || Date.now()).getTime(),
            ) < 800;
          if (!dt) return false;
          const existingTs = Number(item.metadata?.frameTimestamp ?? -1);
          // 不同时间点的回答不应被去重合并
          if (incomingTs >= 0 && existingTs >= 0 && Math.abs(incomingTs - existingTs) > 1) {
            return false;
          }
          return true;
        },
      );
      if (duplicateIndex >= 0) {
        const existing = prev[duplicateIndex];
        const merged: Message = {
          ...existing,
          ...incoming,
          metadata: {
            ...(existing.metadata || {}),
            ...(incoming.metadata || {}),
          },
        };
        const next = [...prev];
        next[duplicateIndex] = merged;
        return next;
      }
      return [...prev, incoming];
    });
  };

  const renderInline = (text: string): ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="rounded bg-black/10 px-1.5 py-0.5 text-[12px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const renderTextBlock = (block: string, key: string) => {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      const rowKey = `${key}-${idx}`;

      if (/^###\s+/.test(trimmed)) {
        return (
          <h4 key={rowKey} className="mt-2 text-[13px] font-semibold text-foreground">
            {renderInline(trimmed.replace(/^###\s+/, ''))}
          </h4>
        );
      }
      if (/^##\s+/.test(trimmed)) {
        return (
          <h3 key={rowKey} className="mt-2 text-[14px] font-semibold text-foreground">
            {renderInline(trimmed.replace(/^##\s+/, ''))}
          </h3>
        );
      }
      if (/^#\s+/.test(trimmed)) {
        return (
          <h2 key={rowKey} className="mt-2 text-[15px] font-bold text-foreground">
            {renderInline(trimmed.replace(/^#\s+/, ''))}
          </h2>
        );
      }
      if (/^[-*]\s+/.test(trimmed)) {
        return (
          <div key={rowKey} className="flex items-start gap-2 text-[13px] leading-6">
            <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            <span>{renderInline(trimmed.replace(/^[-*]\s+/, ''))}</span>
          </div>
        );
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\.\s+/)?.[1] ?? '';
        return (
          <div key={rowKey} className="flex items-start gap-2 text-[13px] leading-6">
            <span className="min-w-5 text-right font-medium opacity-80">{num}.</span>
            <span>{renderInline(trimmed.replace(/^\d+\.\s+/, ''))}</span>
          </div>
        );
      }
      return (
        <p key={rowKey} className="text-[13px] leading-6 whitespace-pre-wrap">
          {renderInline(trimmed)}
        </p>
      );
    });
  };

  const renderMessageContent = (content: string, frameImage?: string, frameTimestamp?: number) => {
    const blocks = content.split(/```/);

    return (
      <div className="max-w-none break-words">
        {frameImage && (
          <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2">
            {frameTimestamp !== undefined && (
              <div className="mb-1 text-xs text-blue-300">时间点: {Math.floor(frameTimestamp)}秒</div>
            )}
            <img
              src={frameImage}
              alt="分析的画面"
              width={320}
              height={180}
              className="rounded-md max-w-full object-contain"
            />
          </div>
        )}
        <div className="space-y-2">
          {blocks.map((block, idx) =>
            idx % 2 === 1 ? (
              <pre key={`code-${idx}`} className="overflow-x-auto rounded-lg bg-black/25 p-3 text-[12px] leading-5 text-blue-100">
                <code>{block.trim()}</code>
              </pre>
            ) : (
              <div key={`text-${idx}`}>{renderTextBlock(block, `text-${idx}`)}</div>
            ),
          )}
        </div>
      </div>
    );
  };

  // 创建会话
  const ensureSession = async () => {
    if (sessionId) return sessionId;

    const created = await chatApi.createSession({
      projectId: projectId || '',
      videoId: currentVideo?.id,
      activePrism: prismForChat ?? undefined,
    });

    setSessionId(created.session.id);
    return created.session.id;
  };

  // WebSocket 连接
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    let socket: any = null;

    const connectSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

      socket = io(`${wsUrl}/ws`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        auth: {
          token: getToken(),
        },
      });

      socket.on('connect', () => {
        console.log('Socket.IO connected');
        if (projectId) {
          socket.emit('join:project', { projectId });
        }
      });

      // 画面分析状态通过消息 metadata 展示，这里只更新 loading 状态。
      socket.on('frame:analysis', (_payload: any) => {
        if (cancelled) return;
        setAnalyzingFrame(false);
      });

      // 处理区域分析事件
      socket.on('frame:region-analysis', (payload: any) => {
        if (cancelled) return;

        try {
          setRegionAnalysis(payload.analysis);
          setTimeout(() => setRegionAnalysis(null), 3000);
        } catch (error) {
          console.error('Region analysis event error:', error);
        }
      });

      // 处理常规消息事件
      socket.on('chat:message', (payload: any) => {
        if (cancelled) return;
        if (payload?.sessionId !== sessionId) return;

        try {
          const newMessage: Message = {
            id: payload.id || `${payload.role}-${Date.now()}`,
            role: payload.role,
            content: payload.content,
            createdAt: payload.timestamp,
            metadata: payload.metadata,
          };
          appendMessageUnique(newMessage);
        } catch (error) {
          console.error('Chat message event error:', error);
        }
      });

      socket.on('connected', (data: any) => {
        console.log('Socket connection confirmed:', data.socketId);
      });

      socket.on('error', (error: any) => {
        console.error('Socket.IO error:', error);
      });

      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected');
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) connectSocket();
          }, 5000);
        }
      });
    };

    connectSocket();

    return () => {
      cancelled = true;
      if (socket) {
        socket.disconnect();
      }
    };
  }, [projectId, sessionId]);

  const handleSend = async () => {
    const messageContent = input.trim();
    if (!messageContent) return;

    // 提取当前视频帧用于画面分析
    const playback = getPlaybackState();
    const preciseTimestamp = Number((playback.currentTime || 0).toFixed(2));
    const includeFrameContext = Boolean(attachPausedFrame && currentVideo?.id);
    const shouldCaptureFrame = includeFrameContext;
    setAnalyzingFrame(Boolean(shouldCaptureFrame));
    const frameBase64 = shouldCaptureFrame ? await captureCurrentFrame() : null;

    setIsSending(true);

    try {
      const sid = await ensureSession();

      const response = await chatApi.sendMessage(sid, {
        content: messageContent.trim(),
        videoId: currentVideo?.id,
        activePrism: prismForChat ?? undefined,
        metadata: {
          frameBase64,
          timestamp: preciseTimestamp,
          includeFrameContext,
          frameContextMode,
          isVideoPaused: playback.isPaused,
          isMidPlayback: playback.isMidPlayback,
        },
      });

      appendMessageUnique({
        id: response.message.id || `user-${Date.now()}`,
        role: response.message.role as Message['role'],
        content: response.message.content,
        createdAt: response.message.createdAt,
        metadata: response.message.metadata as any,
      });
      appendMessageUnique({
        id: response.reply.id || `assistant-${Date.now()}`,
        role: response.reply.role as Message['role'],
        content: response.reply.content,
        createdAt: response.reply.createdAt,
        metadata: response.reply.metadata as any,
      });
      setInput('');
      setIsSending(false);
      setAnalyzingFrame(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      const message = error instanceof Error ? error.message : '消息发送失败';
      appendMessageUnique({
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `模型错误：${message}`,
      });
      setIsSending(false);
      setAnalyzingFrame(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = async (promptTemplate: string) => {
    setInput(promptTemplate + ' ');
  };

  // 滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="panel flex h-full flex-1 min-h-0 flex-col overflow-hidden rounded-none border-x-0 border-b-0 bg-gradient-to-b from-black/5 via-transparent to-transparent" style={{ height }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border-subtle/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#FF6B35]">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012 2h14a2 2 0 012 2z" />
          </svg>
          <h3 className="text-sm font-semibold tracking-wide">对话窗口</h3>
        </div>
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-text-secondary">跨棱镜编排器</span>
      </div>

      {/* Messages */}
      <div
        ref={messageListRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border-subtle/70 bg-black/5 px-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary opacity-60">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012 2h14a2 2 0 012 2z" />
            </svg>
            <div className="text-center">
              <p className="mb-2 text-xs tracking-wide text-text-tertiary">快速指令</p>
              <div className="flex flex-wrap justify-center gap-2">
                {DEFAULT_QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleQuickPrompt(prompt.promptTemplate)}
                    className="rounded-full border border-border-subtle bg-black/10 px-3 py-1 text-[11px] transition-colors hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/10"
                  >
                    {prompt.icon} {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  msg.role === 'user'
                    ? 'ml-auto border border-[#2D7FF9]/30 bg-[#2D7FF9]/12 text-text-primary'
                    : 'mr-auto border border-border-subtle bg-linear-to-r from-[#FF6B35]/12 to-[#E91E8C]/10 text-text-primary'
                }`}
              >
                <div className="mb-1 text-[10px] uppercase tracking-wider text-text-tertiary">
                  {msg.role === 'user' ? '你' : msg.role === 'assistant' ? '助手' : '系统'}
                </div>
                {renderMessageContent(msg.content, msg.metadata?.frameImage, msg.metadata?.frameTimestamp)}

                {/* 区域分析结果显示 */}
                {regionAnalysis && msg.role === 'assistant' && (
                  <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3">
                    <div className="mb-2 text-xs text-purple-300">区域点击分析</div>
                    <div className="text-[13px]">{regionAnalysis}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border-subtle/80 bg-black/10 p-3">
        <div className="rounded-xl border border-border-subtle bg-background/80 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，按 Enter 发送（Shift + Enter 换行）"
            className="min-h-[74px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 focus:outline-none"
            rows={3}
            disabled={isSending}
          />
          <div className="mt-2 flex items-center justify-between px-1">
            <div className="flex flex-col gap-1">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={attachPausedFrame}
                  onChange={(e) => setAttachPausedFrame(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-subtle"
                />
                附带当前画面（按当前播放时间点分析）
              </label>
              {attachPausedFrame && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFrameContextMode('quick')}
                    className={`rounded-md px-2 py-0.5 text-[10px] transition ${
                      frameContextMode === 'quick'
                        ? 'bg-[#2D7FF9]/20 text-[#9bc1ff] border border-[#2D7FF9]/40'
                        : 'bg-black/10 text-text-tertiary border border-border-subtle'
                    }`}
                  >
                    快速附图
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameContextMode('deep')}
                    className={`rounded-md px-2 py-0.5 text-[10px] transition ${
                      frameContextMode === 'deep'
                        ? 'bg-[#FF6B35]/20 text-[#ffc1ad] border border-[#FF6B35]/40'
                        : 'bg-black/10 text-text-tertiary border border-border-subtle'
                    }`}
                  >
                    深度附图
                  </button>
                </div>
              )}
              <span className="text-[10px] text-text-tertiary">
                {analyzingFrame
                  ? '正在进行图片理解 + 视频上下文融合回答...'
                  : attachPausedFrame
                    ? frameContextMode === 'deep'
                      ? '深度模式：融合当前画面 + 当前时间邻域关键帧/转写 + 历史上下文'
                      : '快速模式：融合当前画面 + 当前时间点视频知识 + 历史对话'
                    : '未附图：融合视频知识、历史对话与当前问题'}
              </span>
            </div>
            <button
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="rounded-lg bg-[#2D7FF9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2468cf] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? '发送中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
