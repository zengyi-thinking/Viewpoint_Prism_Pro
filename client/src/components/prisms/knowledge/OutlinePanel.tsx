'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { knowledgeApi } from '@/services/knowledge.api';
import { Loader2, Download, RefreshCw } from 'lucide-react';

interface OutlinePanelProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

function parseTimeToSeconds(token: string): number | null {
  const text = token.trim();
  if (!text) return null;

  const hms = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = Number(hms[3]);
    if ([h, m, s].every(Number.isFinite)) return h * 3600 + m * 60 + s;
  }

  const ms = text.match(/^(\d{1,3}):(\d{2})$/);
  if (ms) {
    const m = Number(ms[1]);
    const s = Number(ms[2]);
    if ([m, s].every(Number.isFinite)) return m * 60 + s;
  }

  const sec = text.match(/^(\d+(?:\.\d+)?)\s*秒$/);
  if (sec) {
    const n = Number(sec[1]);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

const timePattern = /(\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d+(?:\.\d+)?\s*秒\b)/g;
const strictTimePattern = /^(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*秒)$/;

export function OutlinePanel({ videoId, onTimeClick }: OutlinePanelProps) {
  const [outlineMarkdown, setOutlineMarkdown] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadOutline = async () => {
    try {
      setIsLoading(true);
      const data = await knowledgeApi.getOutline(videoId);
      setOutlineMarkdown(data.outlineMarkdown || '');
    } catch (error) {
      console.error('加载知识大纲失败:', error);
      setOutlineMarkdown('');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOutline();
  }, [videoId]);

  const regenerateOutline = async () => {
    try {
      setIsGenerating(true);
      const data = await knowledgeApi.regenerateOutline(videoId);
      setOutlineMarkdown(data.outlineMarkdown || '');
    } catch (error) {
      console.error('生成知识大纲失败:', error);
      alert('生成知识大纲失败，请先确认视频已完成分析。');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadOutline = () => {
    if (!outlineMarkdown.trim()) return;
    const blob = new Blob([outlineMarkdown], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outline-${videoId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderedBlocks = useMemo(() => {
    const lines = outlineMarkdown.split('\n');
    const blocks: React.ReactNode[] = [];
    let bulletItems: string[] = [];
    let key = 0;

    const flushBullets = () => {
      if (!bulletItems.length) return;
      blocks.push(
        <ul key={`ul-${key++}`} className="space-y-1.5 pl-5 list-disc text-[13px] text-text-secondary">
          {bulletItems.map((item, idx) => (
            <li key={`li-${idx}`}>{renderInline(item, onTimeClick)}</li>
          ))}
        </ul>,
      );
      bulletItems = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushBullets();
        blocks.push(<div key={`sp-${key++}`} className="h-2" />);
        continue;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        bulletItems.push(bullet[1]);
        continue;
      }

      flushBullets();

      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const text = heading[2];
        const cls =
          level === 1
            ? 'text-lg font-semibold text-text-primary'
            : level === 2
            ? 'text-sm font-semibold text-text-primary mt-2'
            : 'text-[13px] font-semibold text-text-secondary mt-1';
        blocks.push(
          <p key={`h-${key++}`} className={cls}>
            {renderInline(text, onTimeClick)}
          </p>,
        );
        continue;
      }

      blocks.push(
        <p key={`p-${key++}`} className="text-[13px] leading-6 text-text-secondary">
          {renderInline(line, onTimeClick)}
        </p>,
      );
    }

    flushBullets();
    return blocks;
  }, [outlineMarkdown, onTimeClick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">知识大纲</p>
          <p className="text-[11px] text-text-tertiary">Agent 自整理结构化学习脉络</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={regenerateOutline}
            disabled={isGenerating}
            className="h-8"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadOutline}
            disabled={!outlineMarkdown.trim()}
            className="h-8"
          >
            <Download className="mr-1 h-4 w-4" />
            下载 MD
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-text-tertiary" />
          </div>
        ) : !outlineMarkdown.trim() ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-text-tertiary">暂无知识大纲</p>
            <p className="mt-1 text-xs text-text-tertiary">
              点击「生成」后将自动整理完整学习结构
            </p>
          </div>
        ) : (
          <div className="space-y-1">{renderedBlocks}</div>
        )}
      </div>
    </div>
  );
}

function renderInline(text: string, onTimeClick?: (timestamp: number) => void) {
  const parts = text.split(timePattern);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (strictTimePattern.test(part)) {
          const sec = parseTimeToSeconds(part);
          if (sec !== null && onTimeClick) {
            return (
              <button
                key={`${part}-${index}`}
                onClick={() => onTimeClick(sec)}
                className="mx-0.5 rounded bg-bg-panel-tertiary px-1.5 py-0.5 text-[11px] text-[#FF8A57] hover:bg-[#FF8A57]/15"
              >
                {part}
              </button>
            );
          }
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}
