'use client';

import React, { useState, useEffect } from 'react';
import { knowledgeApi } from '../../../services/knowledge.api';
import {
  CrystalCard,
  CrystalCardType,
  CrystalCardCollection,
} from '../../../types/crystal-card';

interface CrystalCardViewerProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
  className?: string;
}

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

  useEffect(() => {
    loadCrystalCards();
  }, [videoId]);

  useEffect(() => {
    filterCards();
  }, [cards, selectedType, selectedCategory]);

  const loadCrystalCards = async () => {
    try {
      setLoading(true);
      const response = await knowledgeApi.getCrystalCards(videoId);

      if (response?.cards) {
        setCards(response.cards);

        // 提取所有类别
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

    // 按重要性排序
    filtered.sort((a, b) => b.importance - a.importance);

    setFilteredCards(filtered);
  };

  const handleCardExpand = (cardId: string) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  const handleTimeClick = (card: CrystalCard) => {
    if (card.timestamp && onTimeClick) {
      onTimeClick(card.timestamp);
    }
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

  const getCardTypeLabel = (type: CrystalCardType): string => {
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
  };

  const getCardTypeIcon = (type: CrystalCardType): string => {
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
  };

  const getDifficultyColor = (difficulty: number): string => {
    if (difficulty <= 2) return 'text-green-400';
    if (difficulty <= 4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getImportanceStars = (importance: number): string => {
    return '⭐'.repeat(Math.min(importance, 5));
  };

  const getSourceInfo = (card: CrystalCard) => {
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
  };

  return (
    <div className={`crystal-card-viewer h-full min-h-0 flex flex-col ${className}`}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-4 p-4 rounded-lg bg-[var(--bg-panel-secondary)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            晶体蜂巢
          </h3>
          <span className="text-sm text-[var(--text-secondary)]">
            {filteredCards.length} 张卡片
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 视图切换 */}
          <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="网格视图"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
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
            className="px-3 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? '生成中...' : '重新生成'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {/* 筛选器 */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
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
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedType === type
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {getCardTypeIcon(type)} {getCardTypeLabel(type)}
            </button>
          ))}
        </div>

        {/* 类别筛选 */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  selectedCategory === category
                    ? 'bg-[var(--accent-muted)] text-[var(--accent-primary)] border border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* 加载状态 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
            <div className="text-4xl mb-3">🔮</div>
            <p>暂无晶体卡片</p>
            <p className="text-sm mt-1">点击"重新生成"开始创建</p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'flex flex-col gap-3'
            }
          >
            {filteredCards.map((card, index) => (
              <CrystalCardItem
                key={card.id}
                card={card}
                index={index}
                isExpanded={expandedCard === card.id}
                onExpand={() => handleCardExpand(card.id)}
                onTimeClick={() => handleTimeClick(card)}
                getCardTypeLabel={getCardTypeLabel}
                getCardTypeIcon={getCardTypeIcon}
                getDifficultyColor={getDifficultyColor}
                getImportanceStars={getImportanceStars}
                getSourceInfo={getSourceInfo}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* 右下角下载区 */}
      <div className="mt-4 border-t border-[var(--border-subtle)] pt-3 flex items-center justify-end gap-2">
        <button
          onClick={handleDownloadZip}
          disabled={!cards.length || isDownloadingZip}
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          {isDownloadingZip ? '打包中...' : '下载 ZIP'}
        </button>
        <button
          onClick={handleDownloadJson}
          disabled={!cards.length}
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          下载 JSON
        </button>
        <button
          onClick={handleDownloadMarkdown}
          disabled={!cards.length}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          下载 Markdown
        </button>
      </div>
    </div>
  );
}

interface CrystalCardItemProps {
  card: CrystalCard;
  index: number;
  isExpanded: boolean;
  onExpand: () => void;
  onTimeClick: () => void;
  getCardTypeLabel: (type: CrystalCardType) => string;
  getCardTypeIcon: (type: CrystalCardType) => string;
  getDifficultyColor: (difficulty: number) => string;
  getImportanceStars: (importance: number) => string;
  getSourceInfo: (card: CrystalCard) => { label: string; className: string };
  viewMode: 'grid' | 'list';
}

function CrystalCardItem({
  card,
  index,
  isExpanded,
  onExpand,
  onTimeClick,
  getCardTypeLabel,
  getCardTypeIcon,
  getDifficultyColor,
  getImportanceStars,
  getSourceInfo,
  viewMode,
}: CrystalCardItemProps) {
  const sourceInfo = getSourceInfo(card);

  if (viewMode === 'grid') {
    return (
      <button
        type="button"
        onClick={onExpand}
        className={`group relative h-[248px] w-full text-left transition-transform duration-200 hover:-translate-y-1 ${
          index % 2 === 1 ? 'md:translate-y-10' : ''
        }`}
      >
        <div
          className={`absolute inset-0 border transition-all duration-200 ${
            card.isFeatured
              ? 'border-[var(--accent-primary)] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_32px_rgba(0,0,0,0.28)]'
              : 'border-[var(--border-subtle)] shadow-[0_8px_24px_rgba(0,0,0,0.22)]'
          }`}
          style={{
            clipPath:
              'polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)',
            background: card.imageUrl
              ? `linear-gradient(180deg, rgba(8,10,18,0.20), rgba(8,10,18,0.88)), url(${card.imageUrl}) center/cover`
              : 'linear-gradient(160deg, rgba(20,22,34,0.98), rgba(36,39,58,0.92))',
          }}
        />
        <div className="absolute inset-[10%] flex flex-col justify-between overflow-hidden px-2 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-lg" role="img" aria-label="card type">
                {getCardTypeIcon(card.type)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/80">
                {getCardTypeLabel(card.type)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sourceInfo.className}`}>
                {sourceInfo.label}
              </span>
            </div>

            <h4 className="mt-3 line-clamp-3 text-sm font-semibold leading-5 text-white">
              {card.title}
            </h4>

            <p className={`mt-2 text-[12px] leading-5 text-white/72 ${isExpanded ? '' : 'line-clamp-4'}`}>
              {card.summary || card.content}
            </p>
          </div>

          <div className="mt-3">
            {card.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {card.tags.slice(0, 3).map((tag, tagIndex) => (
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
                <span>展开</span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`crystal-card-item bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl overflow-hidden transition-all hover:border-[var(--border-focus)] hover:shadow-lg ${
        card.isFeatured ? 'ring-2 ring-[var(--accent-primary)]' : ''
      } ${viewMode === 'list' ? 'flex' : ''}`}
    >
      {/* 卡片头部 */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-label="card type">
              {getCardTypeIcon(card.type)}
            </span>
            <span className="text-xs text-[var(--text-secondary)] uppercase font-medium">
              {getCardTypeLabel(card.type)}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${sourceInfo.className}`}
            >
              {sourceInfo.label}
            </span>
          </div>
          {card.isFeatured && (
            <span className="text-xs px-2 py-0.5 bg-[var(--accent-primary)] text-white rounded-full">
              精选
            </span>
          )}
        </div>

        <h4 className="text-base font-semibold text-[var(--text-primary)] mb-2 line-clamp-2">
          {card.title}
        </h4>

        {card.summary && !isExpanded && (
          <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
            {card.summary}
          </p>
        )}

        {/* 卡片元信息 */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)] mb-3">
          <span className={getDifficultyColor(card.difficulty)}>
            难度: {'█'.repeat(card.difficulty)}
          </span>
          <span>{getImportanceStars(card.importance)}</span>
          {card.videoTime && (
            <button
              onClick={onTimeClick}
              className="hover:text-[var(--accent-primary)] transition-colors"
              title="跳转到此时间点"
            >
              ⏱️ {card.videoTime}
            </button>
          )}
        </div>

        {/* 标签 */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {card.tags.map((tag, index) => (
              <span
                key={index}
                className="text-xs px-2 py-0.5 bg-[var(--bg-panel-secondary)] text-[var(--text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 卡片内容（展开时显示） */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4">
          {/* 图片 */}
          {card.imageUrl && (
            <div className="mb-3 rounded-lg overflow-hidden">
              <img
                src={card.imageUrl}
                alt={card.title}
                className="w-full h-40 object-cover"
              />
            </div>
          )}

          {/* 完整内容 */}
          <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
            {card.content}
          </div>

          {/* 分类 */}
          {card.category && (
            <div className="mt-3 text-xs text-[var(--text-tertiary)]">
              分类: {card.category}
            </div>
          )}
        </div>
      )}

      {/* 卡片底部 */}
      <div className="px-4 py-3 bg-[var(--bg-panel-secondary)] flex items-center justify-between">
        <button
          onClick={onExpand}
          className="text-sm text-[var(--accent-primary)] hover:text-[var(--accent-hover)] transition-colors"
        >
          {isExpanded ? '收起' : '展开'}
        </button>
        {card.isVerified && (
          <span className="text-xs text-[var(--color-success)]">✓ 已验证</span>
        )}
      </div>
    </div>
  );
}
