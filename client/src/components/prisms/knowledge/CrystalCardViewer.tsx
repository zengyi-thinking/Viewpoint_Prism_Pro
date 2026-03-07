'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { knowledgeApi } from '../../../services/knowledge.api';
import { CrystalCard, CrystalCardType } from '../../../types/crystal-card';

interface CrystalCardViewerProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
  className?: string;
}

type RotationMap = Record<string, number>;

export function CrystalCardViewer({
  videoId,
  onTimeClick,
  className = '',
}: CrystalCardViewerProps) {
  const [cards, setCards] = useState<CrystalCard[]>([]);
  const [filteredCards, setFilteredCards] = useState<CrystalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<CrystalCardType | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [cardRotations, setCardRotations] = useState<RotationMap>({});

  useEffect(() => {
    void loadCrystalCards();
  }, [videoId]);

  useEffect(() => {
    filterCards();
  }, [cards, selectedType, selectedCategory]);

  const expandedIndex = useMemo(
    () => filteredCards.findIndex((card) => card.id === expandedCard),
    [expandedCard, filteredCards],
  );

  const loadCrystalCards = async () => {
    try {
      setLoading(true);
      const response = await knowledgeApi.getCrystalCards(videoId);

      if (response?.cards) {
        setCards(response.cards);
        setExpandedCard(response.cards[0]?.id ?? null);

        const cats = [
          'ALL',
          ...new Set(response.cards.map((card) => card.category || '未分类')),
        ];
        setCategories(cats);
      }
    } catch (error) {
      console.error('Failed to load crystal cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCards = () => {
    let filtered = [...cards];

    if (selectedType !== 'ALL') {
      filtered = filtered.filter((card) => card.type === selectedType);
    }

    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(
        (card) => (card.category || '未分类') === selectedCategory,
      );
    }

    filtered.sort((a, b) => b.importance - a.importance);
    setFilteredCards(filtered);

    if (filtered.length > 0 && !filtered.some((card) => card.id === expandedCard)) {
      setExpandedCard(filtered[0].id);
    }
  };

  const handleCardExpand = (cardId: string) => {
    setExpandedCard((current) => (current === cardId ? null : cardId));
  };

  const handleTimeClick = (card: CrystalCard) => {
    if (card.timestamp && onTimeClick) {
      onTimeClick(card.timestamp);
    }
  };

  const updateRotation = (cardId: string, next: number) => {
    const clamped = Math.max(-18, Math.min(18, next));
    setCardRotations((prev) => ({ ...prev, [cardId]: clamped }));
  };

  const nudgeRotation = (cardId: string, delta: number) => {
    const current = cardRotations[cardId] ?? 0;
    updateRotation(cardId, current + delta);
  };

  const handleRegenerate = async () => {
    try {
      setLoading(true);
      await knowledgeApi.regenerateCrystalCards(videoId, {
        types: [
          CrystalCardType.CONCEPT,
          CrystalCardType.TIMELINE,
          CrystalCardType.INSIGHT,
          CrystalCardType.SUMMARY,
        ],
        maxCards: 12,
      });
      await loadCrystalCards();
    } catch (error) {
      console.error('Failed to regenerate crystal cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!cards.length) return;
    downloadFile(
      `crystal-cards-${videoId}.json`,
      JSON.stringify(
        {
          videoId,
          count: cards.length,
          cards,
        },
        null,
        2,
      ),
      'application/json;charset=utf-8',
    );
  };

  const handleDownloadMarkdown = () => {
    if (!cards.length) return;
    const markdown = cards
      .map((card, index) => {
        const lines = [
          `## ${index + 1}. ${card.title}`,
          '',
          `- 类型: ${getCardTypeLabel(card.type)}`,
          `- 重要性: ${card.importance}/5`,
          card.videoTime ? `- 时间点: ${card.videoTime}` : '',
          card.tags?.length ? `- 标签: ${card.tags.join(', ')}` : '',
          '',
          card.summary ? `> ${card.summary}` : '',
          '',
          card.content,
          '',
        ].filter(Boolean);
        return lines.join('\n');
      })
      .join('\n---\n\n');

    const doc = `# 晶体卡片导出\n\n视频ID: ${videoId}\n卡片数量: ${cards.length}\n\n${markdown}`;
    downloadFile(`crystal-cards-${videoId}.md`, doc, 'text/markdown;charset=utf-8');
  };

  const sanitizeFileName = (value: string) =>
    value
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 80);

  const handleDownloadZip = async () => {
    if (!cards.length || isDownloadingZip) return;

    try {
      setIsDownloadingZip(true);
      const JSZipModule = await import('jszip');
      const JSZip = JSZipModule.default;
      const zip = new JSZip();
      const packageName = sanitizeFileName(`knowledge_crystal_cards_${videoId}`);
      const folder = zip.folder(packageName);
      if (!folder) throw new Error('无法创建压缩包目录');

      const manifest = [
        `Knowledge Crystal Cards Package`,
        `Video ID: ${videoId}`,
        `Card Count: ${cards.length}`,
        '',
        'Files:',
        ...cards.map((card, index) => {
          const source = card.sourceType || 'generated';
          const title = sanitizeFileName(card.title || `card_${index + 1}`);
          return `${(index + 1).toString().padStart(2, '0')}. [${source}] ${title}`;
        }),
      ].join('\n');

      folder.file('README.txt', manifest);
      folder.file(
        'cards.json',
        JSON.stringify(
          {
            videoId,
            exportedAt: new Date().toISOString(),
            count: cards.length,
            cards,
          },
          null,
          2,
        ),
      );

      cards.forEach((card, index) => {
        const source = card.sourceType || 'generated';
        const title = sanitizeFileName(card.title || `card_${index + 1}`);
        const fileName = `${(index + 1).toString().padStart(2, '0')}_${source}_${title}.md`;
        const content = [
          `# ${card.title}`,
          '',
          `- 类型: ${getCardTypeLabel(card.type)}`,
          `- 来源: ${source}`,
          `- 分类: ${card.category || '未分类'}`,
          `- 重要性: ${card.importance}/5`,
          `- 难度: ${card.difficulty}/5`,
          card.videoTime ? `- 时间点: ${card.videoTime}` : '',
          card.tags?.length ? `- 标签: ${card.tags.join(', ')}` : '',
          card.imageUrl ? `- 图片: ${card.imageUrl}` : '',
          '',
          card.summary ? `## 摘要\n${card.summary}\n` : '',
          `## 内容\n${card.content}`,
        ]
          .filter(Boolean)
          .join('\n');

        folder.file(`cards/${fileName}`, content);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${packageName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download crystal card zip:', error);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className={`crystal-card-viewer flex h-full min-h-0 flex-col ${className}`}>
      <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-secondary)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              晶体蜂巢
            </h3>
            <span className="text-sm text-[var(--text-secondary)]">
              {filteredCards.length} 张卡片
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-primary)] p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="蜂巢视图"
              >
                ⬢
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="列表视图"
              >
                ☰
              </button>
            </div>

            <button
              onClick={handleRegenerate}
              disabled={loading}
              className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? '生成中...' : '重新生成'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              selectedType === 'ALL'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            全部
          </button>
          {Object.values(CrystalCardType).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                selectedType === type
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {getCardTypeIcon(type)} {getCardTypeLabel(type)}
            </button>
          ))}
        </div>

        {categories.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                  selectedCategory === category
                    ? 'border border-[var(--accent-primary)] bg-[var(--accent-muted)] text-[var(--accent-primary)]'
                    : 'bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
            <div className="mb-3 text-4xl">🔮</div>
            <p>暂无晶体卡片</p>
            <p className="mt-1 text-sm">点击“重新生成”开始创建</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 justify-items-center gap-x-5 gap-y-8 pb-8 pt-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredCards.map((card, index) => (
              <CrystalHoneycombCard
                key={card.id}
                card={card}
                index={index}
                isExpanded={expandedCard === card.id}
                hasExpandedCard={Boolean(expandedCard)}
                isNeighborShrunk={expandedIndex !== -1 && expandedCard !== card.id}
                rotation={cardRotations[card.id] ?? 0}
                onExpand={() => handleCardExpand(card.id)}
                onRotateChange={(value) => updateRotation(card.id, value)}
                onRotateLeft={() => nudgeRotation(card.id, -4)}
                onRotateRight={() => nudgeRotation(card.id, 4)}
                onTimeClick={() => handleTimeClick(card)}
                getCardTypeLabel={getCardTypeLabel}
                getCardTypeIcon={getCardTypeIcon}
                getImportanceStars={getImportanceStars}
                getSourceInfo={getSourceInfo}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredCards.map((card) => (
              <CrystalListCard
                key={card.id}
                card={card}
                isExpanded={expandedCard === card.id}
                onExpand={() => handleCardExpand(card.id)}
                onTimeClick={() => handleTimeClick(card)}
                getCardTypeLabel={getCardTypeLabel}
                getCardTypeIcon={getCardTypeIcon}
                getDifficultyColor={getDifficultyColor}
                getImportanceStars={getImportanceStars}
                getSourceInfo={getSourceInfo}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          onClick={handleDownloadZip}
          disabled={!cards.length || isDownloadingZip}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          {isDownloadingZip ? '打包中...' : '下载 ZIP'}
        </button>
        <button
          onClick={handleDownloadJson}
          disabled={!cards.length}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          下载 JSON
        </button>
        <button
          onClick={handleDownloadMarkdown}
          disabled={!cards.length}
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          下载 Markdown
        </button>
      </div>
    </div>
  );
}

interface CrystalHoneycombCardProps {
  card: CrystalCard;
  index: number;
  isExpanded: boolean;
  hasExpandedCard: boolean;
  isNeighborShrunk: boolean;
  rotation: number;
  onExpand: () => void;
  onRotateChange: (value: number) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onTimeClick: () => void;
  getCardTypeLabel: (type: CrystalCardType) => string;
  getCardTypeIcon: (type: CrystalCardType) => string;
  getImportanceStars: (importance: number) => string;
  getSourceInfo: (card: CrystalCard) => { label: string; className: string };
}

function CrystalHoneycombCard({
  card,
  index,
  isExpanded,
  hasExpandedCard,
  isNeighborShrunk,
  rotation,
  onExpand,
  onRotateChange,
  onRotateLeft,
  onRotateRight,
  onTimeClick,
  getCardTypeLabel,
  getCardTypeIcon,
  getImportanceStars,
  getSourceInfo,
}: CrystalHoneycombCardProps) {
  const sourceInfo = getSourceInfo(card);
  const baseTranslateY = index % 2 === 1 ? 54 : 0;
  const scale = isExpanded ? 1.16 : hasExpandedCard && isNeighborShrunk ? 0.82 : 1;
  const opacity = hasExpandedCard && isNeighborShrunk ? 0.56 : 1;

  return (
    <div
      className="relative h-[328px] w-[238px] transition-[transform,opacity,filter] duration-300 sm:w-[252px]"
      style={{
        transform: `translateY(${baseTranslateY}px) rotate(${rotation}deg) scale(${scale})`,
        opacity,
        zIndex: isExpanded ? 20 : 1,
        filter: hasExpandedCard && isNeighborShrunk ? 'saturate(0.72)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={onExpand}
        className="group relative h-full w-full text-left"
      >
        <div
          className={`absolute inset-0 border transition-all duration-300 ${
            card.isFeatured
              ? 'border-[var(--accent-primary)] shadow-[0_18px_40px_rgba(0,0,0,0.18)]'
              : 'border-[var(--border-subtle)] shadow-[0_12px_30px_rgba(0,0,0,0.12)]'
          }`}
          style={{
            clipPath:
              'polygon(25% 4.5%, 75% 4.5%, 100% 50%, 75% 95.5%, 25% 95.5%, 0% 50%)',
            background: card.imageUrl
              ? `linear-gradient(180deg, rgba(15,18,28,0.18), rgba(12,14,24,0.88)), url(${card.imageUrl}) center/cover`
              : 'linear-gradient(165deg, rgba(24,26,42,0.98), rgba(44,37,68,0.94) 55%, rgba(26,47,67,0.92))',
          }}
        />

        <div
          className="absolute inset-[11%_9%] flex flex-col justify-between overflow-hidden px-3 py-5"
          style={{
            clipPath:
              'polygon(23% 2.5%, 77% 2.5%, 100% 50%, 77% 97.5%, 23% 97.5%, 0% 50%)',
          }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-lg" role="img" aria-label="card type">
                {getCardTypeIcon(card.type)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] text-white/80">
                {getCardTypeLabel(card.type)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sourceInfo.className}`}>
                {sourceInfo.label}
              </span>
            </div>

            <h4 className="mt-3 line-clamp-3 text-[15px] font-semibold leading-6 text-white">
              {card.title}
            </h4>

            <p className={`mt-3 text-[12px] leading-5 text-white/76 ${isExpanded ? 'line-clamp-8' : 'line-clamp-5'}`}>
              {card.summary || card.content}
            </p>
          </div>

          <div className="mt-4">
            {card.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {card.tags.slice(0, isExpanded ? 4 : 3).map((tag, tagIndex) => (
                  <span
                    key={tagIndex}
                    className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-white/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between text-[10px] text-white/70">
              <span>{getImportanceStars(card.importance)}</span>
              {card.videoTime ? (
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    onTimeClick();
                  }}
                  className="cursor-pointer rounded-full border border-white/10 px-2 py-0.5 hover:text-white"
                >
                  {card.videoTime}
                </span>
              ) : (
                <span>{isExpanded ? '选中中' : '点击放大'}</span>
              )}
            </div>
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div
          className="absolute -bottom-7 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[rgba(17,19,31,0.92)] px-3 py-2 text-white shadow-[0_14px_30px_rgba(0,0,0,0.2)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onRotateLeft}
            className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/80 transition hover:text-white"
          >
            ↺
          </button>
          <input
            type="range"
            min={-18}
            max={18}
            value={rotation}
            onChange={(event) => onRotateChange(Number(event.target.value))}
            className="w-24 accent-[#E91E8C]"
          />
          <button
            type="button"
            onClick={onRotateRight}
            className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/80 transition hover:text-white"
          >
            ↻
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface CrystalListCardProps {
  card: CrystalCard;
  isExpanded: boolean;
  onExpand: () => void;
  onTimeClick: () => void;
  getCardTypeLabel: (type: CrystalCardType) => string;
  getCardTypeIcon: (type: CrystalCardType) => string;
  getDifficultyColor: (difficulty: number) => string;
  getImportanceStars: (importance: number) => string;
  getSourceInfo: (card: CrystalCard) => { label: string; className: string };
}

function CrystalListCard({
  card,
  isExpanded,
  onExpand,
  onTimeClick,
  getCardTypeLabel,
  getCardTypeIcon,
  getDifficultyColor,
  getImportanceStars,
  getSourceInfo,
}: CrystalListCardProps) {
  const sourceInfo = getSourceInfo(card);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] transition-all hover:border-[var(--border-focus)] hover:shadow-lg ${
        card.isFeatured ? 'ring-2 ring-[var(--accent-primary)]' : ''
      }`}
    >
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-label="card type">
              {getCardTypeIcon(card.type)}
            </span>
            <span className="text-xs font-medium uppercase text-[var(--text-secondary)]">
              {getCardTypeLabel(card.type)}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sourceInfo.className}`}>
              {sourceInfo.label}
            </span>
          </div>
          {card.isFeatured ? (
            <span className="rounded-full bg-[var(--accent-primary)] px-2 py-0.5 text-xs text-white">
              精选
            </span>
          ) : null}
        </div>

        <h4 className="mb-2 line-clamp-2 text-base font-semibold text-[var(--text-primary)]">
          {card.title}
        </h4>

        {card.summary && !isExpanded ? (
          <p className="mb-3 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {card.summary}
          </p>
        ) : null}

        <div className="mb-3 flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span className={getDifficultyColor(card.difficulty)}>
            难度: {'█'.repeat(card.difficulty)}
          </span>
          <span>{getImportanceStars(card.importance)}</span>
          {card.videoTime ? (
            <button
              onClick={onTimeClick}
              className="transition-colors hover:text-[var(--accent-primary)]"
              title="跳转到此时间点"
            >
              ⏱️ {card.videoTime}
            </button>
          ) : null}
        </div>

        {card.tags.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {card.tags.map((tag, index) => (
              <span
                key={index}
                className="rounded bg-[var(--bg-panel-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-4">
          {card.imageUrl ? (
            <div className="mb-3 overflow-hidden rounded-lg">
              <img
                src={card.imageUrl}
                alt={card.title}
                className="h-40 w-full object-cover"
              />
            </div>
          ) : null}

          <div className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {card.content}
          </div>

          {card.category ? (
            <div className="mt-3 text-xs text-[var(--text-tertiary)]">
              分类: {card.category}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between bg-[var(--bg-panel-secondary)] px-4 py-3">
        <button
          onClick={onExpand}
          className="text-sm text-[var(--accent-primary)] transition-colors hover:text-[var(--accent-hover)]"
        >
          {isExpanded ? '收起' : '展开'}
        </button>
        {card.isVerified ? (
          <span className="text-xs text-[var(--color-success)]">✓ 已验证</span>
        ) : null}
      </div>
    </div>
  );
}

function getCardTypeLabel(type: CrystalCardType): string {
  const labels: Record<CrystalCardType, string> = {
    [CrystalCardType.CONCEPT]: '概念',
    [CrystalCardType.TIMELINE]: '时间线',
    [CrystalCardType.COMPARISON]: '对比',
    [CrystalCardType.INSIGHT]: '洞察',
    [CrystalCardType.QUOTE]: '引用',
    [CrystalCardType.KEYFRAME]: '关键帧',
    [CrystalCardType.QA]: '问答',
    [CrystalCardType.SUMMARY]: '摘要',
  };
  return labels[type] || type;
}

function getCardTypeIcon(type: CrystalCardType): string {
  const icons: Record<CrystalCardType, string> = {
    [CrystalCardType.CONCEPT]: '💡',
    [CrystalCardType.TIMELINE]: '📅',
    [CrystalCardType.COMPARISON]: '⚖️',
    [CrystalCardType.INSIGHT]: '🔍',
    [CrystalCardType.QUOTE]: '💬',
    [CrystalCardType.KEYFRAME]: '🖼️',
    [CrystalCardType.QA]: '❓',
    [CrystalCardType.SUMMARY]: '📝',
  };
  return icons[type] || '📄';
}

function getDifficultyColor(difficulty: number): string {
  if (difficulty <= 2) return 'text-green-400';
  if (difficulty <= 4) return 'text-yellow-400';
  return 'text-red-400';
}

function getImportanceStars(importance: number): string {
  return '⭐'.repeat(Math.min(importance, 5));
}

function getSourceInfo(card: CrystalCard) {
  const source =
    card.sourceType ||
    (typeof card.metadata?.source === 'string' ? String(card.metadata.source) : '') ||
    (card.type === CrystalCardType.QA
      ? 'qa'
      : card.type === CrystalCardType.KEYFRAME
        ? 'keyframe'
        : 'outline');

  switch (source) {
    case 'deepAnalysis':
    case 'deep_analysis':
      return {
        label: '深度分析',
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
      };
    case 'qa':
    case 'chat':
      return {
        label: 'Q&A',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      };
    case 'keyframe':
      return {
        label: '关键帧',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      };
    case 'outline_service':
    case 'outline':
    default:
      return {
        label: '大纲',
        className: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
      };
  }
}
