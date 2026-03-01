'use client';

import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDockProps {
  height?: number;
}

export function ChatDock({ height = 280 }: ChatDockProps) {
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
    <div className="panel flex shrink-0 flex-col rounded-none border-x-0 border-b-0 border-t border-border" style={{ height: `${height}px` }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-xs text-text-tertiary">对话窗口 · 跨棱镜编排器</p>
            <div className="flex gap-2">
              {['/summarize', '/mindmap', '/translate'].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setInput(cmd + ' ')}
                  className="badge"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
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
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border px-4 py-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息或指令..."
          className="input flex-1 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] text-text-inverse transition hover:opacity-90 disabled:opacity-30"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
