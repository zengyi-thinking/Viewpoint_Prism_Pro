'use client';

import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDockProps {
  height?: number; // Keep for compatibility but unused
}

export function ChatDock({ height }: ChatDockProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // TODO: send to backend, receive AI response
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
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'ml-auto bg-bg-panel-tertiary text-text-secondary'
                    : 'mr-auto bg-linear-to-r from-[#FF6B35]/10 to-[#E91E8C]/10 text-text-secondary'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="shrink-0 flex items-center gap-2 border-t border-border-subtle px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息或指令..."
          className="input flex-1 px-3 py-2 text-xs"
        />
        <button
          type="submit"
          disabled={!input.trim()}
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
