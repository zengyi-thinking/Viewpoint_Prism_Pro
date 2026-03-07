'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { knowledgeApi } from '@/services/knowledge.api';
import { Download, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

interface Flashcard {
  id: string;
  title?: string | null;
  front: string;
  back: string;
  chapter?: string | null;
  difficulty: number;
  createdAt: string;
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function buildFlashcardTitle(card: Flashcard, index?: number) {
  if (card.title?.trim()) {
    return index !== undefined
      ? `${String(index + 1).padStart(2, '0')}_${card.title.trim()}`
      : card.title.trim();
  }

  const chapter = (card.chapter || '学习卡片').trim();
  const front = String(card.front || '')
    .replace(/[？?！!。,.，:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const core =
    front
      .replace(/^(什么是|为什么|如何|怎样|请解释|说明|介绍|概述)\s*/u, '')
      .slice(0, 20) || '核心知识';

  return index !== undefined
    ? `${String(index + 1).padStart(2, '0')}_${chapter}_${core}`
    : `${chapter}_${core}`;
}

interface FlashcardsPanelProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

function parseTimestampFromCard(card: Flashcard): number | null {
  const text = `${card.front}\n${card.back}`;
  const hms = text.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);

  const ms = text.match(/\b(\d{1,3}):(\d{2})\b/);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);

  const sec = text.match(/(\d+(?:\.\d+)?)\s*秒/);
  if (sec) return Number(sec[1]);

  return null;
}

export function FlashcardsPanel({ videoId, onTimeClick }: FlashcardsPanelProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const currentCard = cards[index] || null;
  const currentTimeAnchor = useMemo(
    () => (currentCard ? parseTimestampFromCard(currentCard) : null),
    [currentCard],
  );

  const loadCards = async () => {
    try {
      setIsLoading(true);
      const data = await knowledgeApi.getFlashcards(videoId);
      const items = (data.items || []) as Flashcard[];
      setCards(items);
      setIndex(0);
      setIsFlipped(false);
    } catch (error) {
      console.error('加载学习卡片失败:', error);
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, [videoId]);

  const regenerateCards = async () => {
    try {
      setIsGenerating(true);
      const data = await knowledgeApi.regenerateFlashcards(videoId, { maxCards: 12 });
      const items = (data.items || []) as Flashcard[];
      setCards(items);
      setIndex(0);
      setIsFlipped(false);
    } catch (error) {
      console.error('生成学习卡片失败:', error);
      alert('学习卡片生成失败，请先确认视频已完成分析。');
    } finally {
      setIsGenerating(false);
    }
  };

  const goPrev = () => {
    if (!cards.length) return;
    setIndex((prev) => (prev - 1 + cards.length) % cards.length);
    setIsFlipped(false);
  };

  const goNext = () => {
    if (!cards.length) return;
    setIndex((prev) => (prev + 1) % cards.length);
    setIsFlipped(false);
  };

  const shuffleCards = () => {
    if (cards.length <= 1) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setIndex(0);
    setIsFlipped(false);
  };

  const drawCardPng = async (card: Flashcard) => {
    const width = 1200;
    const height = 675;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#1D2433');
    bg.addColorStop(0.5, '#2A223B');
    bg.addColorStop(1, '#162530');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, 52, 46, width - 104, height - 92, 28, true, false);

    const cardTitle = buildFlashcardTitle(card);

    ctx.fillStyle = '#FF8A57';
    ctx.font = '600 28px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText(card.chapter || '学习卡片', 88, 104);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 34px "Segoe UI", "PingFang SC", sans-serif';
    wrapText(ctx, cardTitle, 88, 162, width - 176, 44, 2);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 42px "Segoe UI", "PingFang SC", sans-serif';
    wrapText(ctx, card.front, 88, 246, width - 176, 52, 3);

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '500 28px "Segoe UI", "PingFang SC", sans-serif';
    wrapText(ctx, card.back, 88, 420, width - 176, 40, 4);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 22px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText(`难度 ${Math.max(1, Math.min(5, card.difficulty || 1))}/5`, 88, height - 68);
    ctx.fillText(`Viewpoint Prism Pro`, width - 330, height - 68);

    return canvas;
  };

  const exportCardAsPngBlob = async (card: Flashcard) => {
    const canvas = await drawCardPng(card);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('PNG 导出失败'));
      }, 'image/png');
    });
    return blob;
  };

  const downloadCardAsPng = async (card: Flashcard) => {
    const blob = await exportCardAsPngBlob(card);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFileName(buildFlashcardTitle(card))}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllCardsAsZip = async () => {
    if (!cards.length || isDownloading) return;
    setIsDownloading(true);
    try {
      const JSZipModule = await import('jszip');
      const JSZip = JSZipModule.default;
      const zip = new JSZip();
      const packageName = sanitizeFileName(`learning_cards_${videoId}`);

      const manifestLines = [
        'Viewpoint Prism Pro Learning Cards',
        `Video ID: ${videoId}`,
        `Card Count: ${cards.length}`,
        '',
        'Cards:',
      ];

      for (const [cardIndex, card] of cards.entries()) {
        const cardTitle = buildFlashcardTitle(card, cardIndex);
        const safeTitle = sanitizeFileName(cardTitle);
        const pngBlob = await exportCardAsPngBlob(card);
        zip.file(`${safeTitle}.png`, pngBlob);
        zip.file(
          `${safeTitle}.md`,
          [
            `# ${cardTitle}`,
            '',
            `- 章节: ${card.chapter || '学习卡片'}`,
            `- 难度: ${Math.max(1, Math.min(5, card.difficulty || 1))}/5`,
            '',
            '## 正面',
            card.front,
            '',
            '## 背面',
            card.back,
          ].join('\n'),
        );
        manifestLines.push(`${String(cardIndex + 1).padStart(2, '0')}. ${cardTitle}`);
      }

      zip.file('README.txt', manifestLines.join('\n'));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${packageName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">学习卡片</p>
          <p className="text-[11px] text-text-tertiary">AI 闪卡 · 智能命名 · 支持 ZIP 打包下载</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={regenerateCards}
            disabled={isGenerating}
            className="h-8"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadAllCardsAsZip}
            disabled={!cards.length || isDownloading}
            className="h-8"
          >
            <Download className="mr-1 h-4 w-4" />
            {isDownloading ? '打包中...' : '全部 ZIP'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-text-tertiary" />
          </div>
        ) : !currentCard ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-text-tertiary">暂无学习卡片</p>
            <p className="mt-1 text-xs text-text-tertiary">
              点击「生成」后将自动创建可复习闪卡
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-text-tertiary">
                {index + 1} / {cards.length}
              </span>
              <span className="max-w-[42%] truncate text-right text-xs font-medium text-text-secondary">
                {buildFlashcardTitle(currentCard, index)}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={shuffleCards} className="h-8 px-2">
                  <RotateCcw className="mr-1 h-4 w-4" />
                  打乱
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadCardAsPng(currentCard)}
                  className="h-8 px-2"
                >
                  <Download className="mr-1 h-4 w-4" />
                  下载当前 PNG
                </Button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-x-auto pb-2">
              <div className="[perspective:1200px] w-full min-w-[22rem] max-w-[46rem]">
                <button
                  type="button"
                  onClick={() => setIsFlipped((v) => !v)}
                  className={`relative min-h-[360px] w-full rounded-2xl text-left transition-transform duration-500 [transform-style:preserve-3d] ${
                    isFlipped ? '[transform:rotateY(180deg)]' : ''
                  }`}
                >
                  <div className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#FF6B35]/20 via-[#E91E8C]/18 to-[#4F46E5]/20 p-6 shadow-[0_20px_40px_rgba(0,0,0,0.25)] [backface-visibility:hidden]">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/80">
                        {currentCard.chapter || '知识点'}
                      </span>
                      <span className="text-[11px] text-white/70">正面</span>
                    </div>
                    <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-white/60">
                      {buildFlashcardTitle(currentCard, index)}
                    </p>
                    <p className="text-[22px] font-semibold leading-9 text-white">{currentCard.front}</p>
                    <p className="mt-4 text-xs text-white/65">点击翻转查看答案</p>
                  </div>

                  <div className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#4F46E5]/22 via-[#06B6D4]/18 to-[#10B981]/18 p-6 shadow-[0_20px_40px_rgba(0,0,0,0.25)] [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/80">
                        难度 {Math.max(1, Math.min(5, currentCard.difficulty || 1))}/5
                      </span>
                      <span className="text-[11px] text-white/70">背面</span>
                    </div>
                    <p className="text-[16px] leading-7 text-white/95 whitespace-pre-wrap">
                      {currentCard.back}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={goPrev} className="h-8 px-3">
                  上一张
                </Button>
                <Button size="sm" variant="outline" onClick={goNext} className="h-8 px-3">
                  下一张
                </Button>
              </div>
              {currentTimeAnchor !== null && onTimeClick && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onTimeClick(currentTimeAnchor)}
                  className="h-8 text-[#FF8A57]"
                >
                  跳转到视频相关片段
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const normalized = String(text || '').replace(/\n/g, ' ').trim();
  if (!normalized) return;

  const words = normalized.includes(' ')
    ? normalized.split(/\s+/)
    : Array.from(normalized);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const separator = normalized.includes(' ') ? ' ' : '';
    const trial = current ? `${current}${separator}${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      continue;
    }

    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      ctx.measureText(last).width > maxWidth ? `${last.slice(0, Math.max(0, last.length - 2))}...` : last;
  }

  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
}
