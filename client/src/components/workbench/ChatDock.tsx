'use client';

import { useState, useEffect, useRef } from 'react';
import { chatApi, type QuickPrompt } from '@/services/chat.api';
import { useWorkbenchStore } from '@/stores/workbench.store';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatDockProps {
  projectId?: string;
  height?: number; // Keep for compatibility but unused
}

export function ChatDock({ projectId, height }: ChatDockProps) {
  const { activePrism, currentVideo, setActivePrism } = useWorkbenchStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionVideoId, setSessionVideoId] = useState<string | null>(null);
  const [sessionPrism, setSessionPrism] = useState<string | null>(null);
  const effectivePrism = activePrism ?? (currentVideo?.id ? 'knowledge' : undefined);
  const contextKey = currentVideo?.id ?? '__project__';
  const sessionByContextRef = useRef<Record<string, string>>({});
  const messagesByContextRef = useRef<Record<string, Message[]>>({});

  useEffect(() => {
    const fetchQuickPrompts = async () => {
      setIsLoadingPrompts(true);
      try {
        const data = await chatApi.getQuickPrompts();
        setQuickPrompts(data.prompts || []);
      } catch (error) {
        console.error('Failed to fetch quick prompts:', error);
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    fetchQuickPrompts();
  }, []);

  const createSessionForContext = async () => {
    if (!projectId) {
      setSessionId(null);
      setSessionVideoId(null);
      setSessionPrism(null);
      setMessages([]);
      return null;
    }

    const created = await chatApi.createSession({
      projectId,
      videoId: currentVideo?.id,
      activePrism: effectivePrism,
    });
    setSessionId(created.session.id);
    setSessionVideoId(created.session.videoId ?? null);
    setSessionPrism(created.session.activePrism ?? null);
    sessionByContextRef.current[contextKey] = created.session.id;

    const history = await chatApi.getMessages(created.session.id, { limit: 50 });
    const mapped = history.items.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
    }));
    setMessages(mapped);
    messagesByContextRef.current[contextKey] = mapped;
    return created.session.id;
  };

  // 同步当前上下文消息缓存，切换视频后可恢复
  useEffect(() => {
    messagesByContextRef.current[contextKey] = messages;
  }, [contextKey, messages]);

  useEffect(() => {
    let cancelled = false;
    const bootstrapSession = async () => {
      if (!projectId) {
        setSessionId(null);
        setSessionVideoId(null);
        setSessionPrism(null);
        setMessages([]);
        return;
      }

      const cachedMessages = messagesByContextRef.current[contextKey];
      setMessages(cachedMessages ?? []);

      const cachedSessionId = sessionByContextRef.current[contextKey];
      if (cachedSessionId) {
        setSessionId(cachedSessionId);
        setSessionVideoId(currentVideo?.id ?? null);
        setSessionPrism(effectivePrism ?? null);
        try {
          const history = await chatApi.getMessages(cachedSessionId, { limit: 50 });
          if (cancelled) return;
          const mapped = history.items.map((item) => ({
            id: item.id,
            role: item.role,
            content: item.content,
          }));
          setMessages(mapped);
          messagesByContextRef.current[contextKey] = mapped;
          return;
        } catch (error) {
          console.error('Failed to load cached session history:', error);
        }
      }

      try {
        await createSessionForContext();
      } catch (error) {
        console.error('Failed to initialize chat session:', error);
      }
    };

    bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, [projectId, contextKey, effectivePrism]);

  const ensureSession = async () => {
    const currentVideoId = currentVideo?.id ?? null;
    const currentPrism = effectivePrism ?? null;
    const cachedSessionId = sessionByContextRef.current[contextKey];
    if (cachedSessionId && (!sessionId || sessionId !== cachedSessionId)) {
      setSessionId(cachedSessionId);
      setSessionVideoId(currentVideoId);
      setSessionPrism(currentPrism);
      return cachedSessionId;
    }
    if (
      sessionId &&
      sessionVideoId === currentVideoId &&
      sessionPrism === currentPrism
    ) {
      return sessionId;
    }
    if (!projectId) throw new Error('No project selected');
    const sid = await createSessionForContext();
    if (!sid) throw new Error('Failed to create chat session');
    return sid;
  };

  const handleSend = async (content: string) => {
    const messageContent = content || input;
    if (!messageContent.trim() || isSending) return;

    const normalized = messageContent.trim().toLowerCase();
    const isMindmapIntent =
      normalized.startsWith('/mindmap') || /思维导图|脑图|mind\s*map|mindmap/i.test(messageContent);
    const isSummaryIntent =
      normalized.startsWith('/summarize') || /总结|概括|摘要|梳理|复盘|要点|文章/i.test(messageContent);
    const requiresVideoContext = isMindmapIntent || isSummaryIntent;

    if (requiresVideoContext && !currentVideo?.id) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '请先在左侧点击一个视频（不是只勾选），再发送总结/导图指令。',
        },
      ]);
      return;
    }

    const targetPrism = requiresVideoContext
      ? 'knowledge'
      : effectivePrism;
    if (requiresVideoContext && activePrism !== 'knowledge') {
      setActivePrism('knowledge');
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const sid = await ensureSession();
      const response = await chatApi.sendMessage(sid, {
        content: messageContent.trim(),
        videoId: currentVideo?.id,
        activePrism: targetPrism,
      });

      setMessages((prev) => {
        const replyMsg: Message = {
          id: response.reply.id,
          role: response.reply.role as Message['role'],
          content: response.reply.content,
        };
        const next = [
          ...prev,
          replyMsg,
        ];
        messagesByContextRef.current[contextKey] = next;
        return next;
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => {
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '消息发送失败，请检查后端服务与登录状态。',
        };
        const next = [
          ...prev,
          errorMsg,
        ];
        messagesByContextRef.current[contextKey] = next;
        return next;
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleQuickPrompt = (prompt: QuickPrompt) => {
    if (prompt.type === 'mindmap') {
      handleSend('/mindmap 生成当前视频的结构化思维导图，输出主线、分支和关键结论。');
      return;
    }

    if (prompt.type === 'summary' || prompt.type === 'crystal_card') {
      handleSend('/summarize 基于当前视频生成学习总结，并产出可复习的晶体卡片。');
      return;
    }

    handleSend(prompt.promptTemplate);
  };

  const renderInlineMarkdown = (text: string) => {
    const nodes: React.ReactNode[] = [];
    let rest = text;
    let key = 0;

    while (rest.length > 0) {
      const boldMatch = rest.match(/\*\*(.+?)\*\*/);
      const codeMatch = rest.match(/`([^`]+?)`/);
      const match =
        boldMatch && codeMatch
          ? boldMatch.index! < codeMatch.index!
            ? { type: 'bold' as const, raw: boldMatch[0], inner: boldMatch[1], index: boldMatch.index! }
            : { type: 'code' as const, raw: codeMatch[0], inner: codeMatch[1], index: codeMatch.index! }
          : boldMatch
          ? { type: 'bold' as const, raw: boldMatch[0], inner: boldMatch[1], index: boldMatch.index! }
          : codeMatch
          ? { type: 'code' as const, raw: codeMatch[0], inner: codeMatch[1], index: codeMatch.index! }
          : null;

      if (!match) {
        nodes.push(<span key={`t-${key++}`}>{rest}</span>);
        break;
      }

      if (match.index > 0) {
        nodes.push(<span key={`t-${key++}`}>{rest.slice(0, match.index)}</span>);
      }

      if (match.type === 'bold') {
        nodes.push(
          <strong key={`b-${key++}`} className="font-semibold text-text-primary">
            {match.inner}
          </strong>,
        );
      } else {
        nodes.push(
          <code
            key={`c-${key++}`}
            className="rounded bg-bg-panel-tertiary px-1 py-0.5 text-[12px]"
          >
            {match.inner}
          </code>,
        );
      }

      rest = rest.slice(match.index + match.raw.length);
    }

    return nodes;
  };

  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    const blocks: React.ReactNode[] = [];
    let listItems: string[] = [];
    let key = 0;

    const flushList = () => {
      if (!listItems.length) return;
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1">
          {listItems.map((item, idx) => (
            <li key={`li-${idx}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        listItems.push(trimmed.replace(/^[-*]\s+/, ''));
        continue;
      }

      flushList();

      if (!trimmed) {
        blocks.push(<div key={`sp-${key++}`} className="h-1.5" />);
        continue;
      }

      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        blocks.push(
          <p key={`h-${key++}`} className="font-semibold text-text-primary">
            {renderInlineMarkdown(heading[2])}
          </p>,
        );
        continue;
      }

      blocks.push(
        <p key={`p-${key++}`} className="leading-6 whitespace-pre-wrap">
          {renderInlineMarkdown(line)}
        </p>,
      );
    }

    flushList();
    return blocks;
  };

  return (
    <div className="panel flex flex-1 flex-col rounded-none border-x-0 border-b-0 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <h3 className="text-xs font-semibold text-text-secondary">对话窗口</h3>
        </div>
        <span className="text-[10px] text-text-tertiary">跨棱镜编排器</span>
      </div>

      {/* Context hint */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        {!currentVideo ? (
          <p className="text-[10px] text-text-tertiary">
            当前未绑定视频。请点击左侧视频卡片后再进行智能问答。
          </p>
        ) : activePrism !== 'knowledge' ? (
          <p className="text-[10px] text-text-tertiary">
            当前棱镜：{activePrism || '未选择'}。视频智能问答建议切换到知识棱镜。
          </p>
        ) : currentVideo.transcriptStatus !== 'COMPLETED' || currentVideo.keyframeStatus !== 'COMPLETED' ? (
          <p className="text-[10px] text-text-tertiary">
            视频已绑定：{currentVideo.title}。请先“确认导入”完成分析，回答会更准确。
          </p>
        ) : (
          <p className="text-[10px] text-text-tertiary">
            已连接视频上下文：{currentVideo.title}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary opacity-30">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <div className="text-center">
              <p className="text-xs text-text-tertiary mb-2">快速指令</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['/summarize', '/mindmap', '/translate'].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => setInput(cmd + ' ')}
                    className="badge text-[10px]"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${
                  msg.role === 'user'
                    ? 'ml-auto bg-bg-panel-tertiary text-text-secondary'
                    : 'mr-auto bg-gradient-to-r from-[#FF6B35]/10 to-[#E91E8C]/10 text-text-secondary'
                }`}
              >
                {renderMessageContent(msg.content)}
              </div>
            ))}
            {isSending && (
              <div className="mr-auto max-w-[85%] rounded-2xl bg-gradient-to-r from-[#FF6B35]/10 to-[#E91E8C]/10 px-3 py-2 text-xs text-text-tertiary">
                正在思考...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Prompt Buttons */}
      {!isLoadingPrompts && quickPrompts.length > 0 && (
        <div className="shrink-0 border-t border-border-subtle px-3 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isSending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-bg-panel-tertiary px-2.5 py-1.5 text-[10px] text-text-secondary transition hover:bg-bg-panel-secondary hover:text-text-primary disabled:opacity-50"
                title={prompt.promptTemplate}
              >
                <span className="text-xs">{prompt.icon}</span>
                <span className="whitespace-nowrap">{prompt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleFormSubmit} className="shrink-0 flex items-center gap-2 border-t border-border-subtle px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息或指令..."
          className="input flex-1 px-3 py-2 text-xs"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={!input.trim() || isSending}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] text-text-inverse transition hover:opacity-90 disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
