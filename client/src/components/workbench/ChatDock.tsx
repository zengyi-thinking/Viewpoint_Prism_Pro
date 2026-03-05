'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Image from 'next/image';
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

  // 画面分析相关状态
  const [analyzingFrame, setAnalyzingFrame] = useState(false);
  const [frameAnalysisResult, setFrameAnalysisResult] = useState<{
    timestamp: number;
    description: string;
    imageUrl: string | null;
  } | null>(null);
  const [regionAnalysis, setRegionAnalysis] = useState<string | null>(null);
  const activePrism = useWorkbenchStore((s) => s.activePrism);
  const currentVideo = useWorkbenchStore((s) => s.currentVideo);
  const prismForChat = (activePrism ?? (currentVideo ? 'knowledge' : null)) as
    | 'knowledge'
    | 'creation'
    | 'translation'
    | 'diffraction'
    | null;

  const messageListRef = useRef<HTMLDivElement>(null);

  // 提取当前视频帧用于画面分析
  const captureCurrentFrame = (): string | null => {
    const videoEl = videoPlayerRef?.current;
    if (!videoEl || videoEl.readyState !== 4) {
      return null; // HAVE_ENOUGH_DATA
    }

    try {
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

  const appendMessageUnique = (incoming: Message) => {
    setMessages((prev) => {
      const normalizedIncoming = incoming.content.trim();
      const duplicate = prev.some(
        (item) =>
          item.role === incoming.role &&
          item.content.trim() === normalizedIncoming &&
          Math.abs(new Date(item.createdAt || Date.now()).getTime() - new Date(incoming.createdAt || Date.now()).getTime()) < 3000,
      );
      if (duplicate) return prev;
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
            <Image src={frameImage} alt="分析的画面" width={320} height={180} className="rounded-md" />
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

      // 处理画面分析事件
      socket.on('frame:analysis', (payload: any) => {
        if (cancelled) return;

        try {
          setFrameAnalysisResult({
            timestamp: payload.timestamp,
            description: payload.description,
            imageUrl: payload.imageUrl,
          });
          setAnalyzingFrame(false);
        } catch (error) {
          console.error('Frame analysis event error:', error);
        }
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
    const frameBase64 = captureCurrentFrame();
    const currentTime = (videoPlayerRef?.current as any)?.currentTime || 0;
    setAnalyzingFrame(Boolean(frameBase64 && prismForChat === 'knowledge'));
    setFrameAnalysisResult(null);

    setIsSending(true);

    try {
      const sid = await ensureSession();

      const response = await chatApi.sendMessage(sid, {
        content: messageContent.trim(),
        videoId: currentVideo?.id,
        activePrism: prismForChat ?? undefined,
        metadata: {
          frameBase64,
          timestamp: currentTime,
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

                {/* 画面分析结果显示 */}
                {msg.role === 'assistant' && frameAnalysisResult?.timestamp === msg.metadata?.frameTimestamp && frameAnalysisResult && (
                  <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border">
                    <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                      画面分析结果 @{Math.floor(frameAnalysisResult.timestamp)}秒
                    </div>
                    <Image src={frameAnalysisResult.imageUrl || ''} alt="分析的画面" width={280} height={157} className="rounded-md max-w-[70%] w-full object-contain" />
                    <div className="text-sm mt-2">{frameAnalysisResult.description}</div>
                  </div>
                )}

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
            <span className="text-[11px] text-text-tertiary">
              {analyzingFrame ? '正在分析当前画面...' : '支持基于当前播放画面与知识库回答'}
            </span>
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
