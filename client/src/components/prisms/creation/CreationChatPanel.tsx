'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CharacterAsset,
  CreationConversationMessage,
  CreationScenePlanScene,
  IdeaPreviewOption,
  SceneAsset,
  ScriptPlanChapter,
  StoryboardSegment,
  VoiceCasting,
} from '@/services/creation.api';

interface CreationChatPanelProps {
  messages: CreationConversationMessage[];
  input: string;
  summary: {
    storyIntent: string;
    visualStyle: string;
    splitPreference: string;
  };
  scriptDraft: string;
  previews: IdeaPreviewOption[];
  selectedPreviewId?: string | null;
  chapters: ScriptPlanChapter[];
  scenes: CreationScenePlanScene[];
  characterAssets: CharacterAsset[];
  sceneAssets: SceneAsset[];
  storyboardSegments: StoryboardSegment[];
  voiceCasting: VoiceCasting[];
  confirmedSegmentIds: string[];
  busyText?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
  onConfirmWorkflow: () => void;
  onConfirmSegmentPreview: (segmentId: string) => void;
  onAdjustDraft: (payload: { targetType: 'preview' | 'chapter'; targetId: string; instruction: string }) => Promise<void>;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-panel-secondary px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{label}</div>
      <p className="mt-1 text-xs leading-5 text-text-primary">{value}</p>
    </div>
  );
}

function CollapsiblePanel({
  title,
  children,
  collapsed,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-secondary"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {collapsed ? null : <div className="mt-3">{children}</div>}
    </section>
  );
}

const DIRECTOR_QUICK_PROMPTS = [
  '武打 + 悬疑 + 机器人',
  '电影感悬疑短片',
  '先定故事核心',
];

function formatMessageTime(createdAt?: string) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function CreationChatPanel({
  messages,
  input,
  summary,
  scriptDraft,
  previews,
  selectedPreviewId,
  chapters,
  scenes,
  characterAssets,
  sceneAssets,
  storyboardSegments,
  voiceCasting,
  confirmedSegmentIds,
  busyText,
  onInputChange,
  onSend,
  onReset,
  onConfirmWorkflow,
  onConfirmSegmentPreview,
  onAdjustDraft,
}: CreationChatPanelProps) {
  const [chapterDrafts, setChapterDrafts] = useState<Record<number, ScriptPlanChapter>>({});
  const [detailModal, setDetailModal] = useState<null | { type: 'preview' | 'chapter'; id: string }>(null);
  const [adjustInstruction, setAdjustInstruction] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    chat: false,
    summary: false,
    scriptDraft: false,
    production: false,
    previews: false,
    previewGrid: false,
    chapters: false,
  });
  const compactSummary = useMemo(
    () =>
      [
        summary.storyIntent && { label: '故事', value: summary.storyIntent },
        summary.visualStyle && { label: '风格', value: summary.visualStyle },
        summary.splitPreference && { label: '拆分', value: summary.splitPreference },
      ].filter(Boolean) as Array<{ label: string; value: string }>,
    [summary.storyIntent, summary.visualStyle, summary.splitPreference],
  );
  const timelineMessages = useMemo(() => {
    if (messages.length > 0) return messages;
    return [
      {
        id: 'creation-director-welcome',
        role: 'assistant' as const,
        content: '先告诉我你想做什么视频，我会边聊边帮你把故事、风格和章节方向定下来。',
        createdAt: new Date().toISOString(),
      },
    ];
  }, [messages]);

  // 只在 chapters 内容真正变化时才更新 chapterDrafts
  // 缓存章节索引和标题，只有当这些值变化时才更新
  const chaptersSignature = useMemo(() => {
    return chapters.map((c) => `${c.index}:${c.title}`).join('|');
  }, [chapters]);

  const prevSignatureRef = useRef(chaptersSignature);

  useEffect(() => {
    // 只在章节内容真正变化时更新
    if (prevSignatureRef.current !== chaptersSignature) {
      setChapterDrafts(
        Object.fromEntries(
          chapters.map((chapter) => [
            chapter.index,
            { ...chapter },
          ]),
        ),
      );
      prevSignatureRef.current = chaptersSignature;
    }
  }, [chaptersSignature]);

  const activePreview = useMemo(
    () => (detailModal?.type === 'preview' ? previews.find((item) => item.id === detailModal.id) || null : null),
    [detailModal, previews],
  );
  const activeChapter = useMemo(
    () =>
      detailModal?.type === 'chapter'
        ? chapters.find((item) => String(item.index) === detailModal.id) || null
        : null,
    [detailModal, chapters],
  );
  const previewChapterIndex = useMemo(
    () => storyboardSegments[0]?.chapterIndex || chapters[0]?.index || null,
    [storyboardSegments, chapters],
  );
  const previewSegments = useMemo(
    () =>
      previewChapterIndex
        ? storyboardSegments.filter((item) => item.chapterIndex === previewChapterIndex).slice(0, 9)
        : [],
    [previewChapterIndex, storyboardSegments],
  );

  const handleAdjust = async () => {
    if (!detailModal || !adjustInstruction.trim()) return;
    setIsAdjusting(true);
    try {
      await onAdjustDraft({
        targetType: detailModal.type,
        targetId: detailModal.id,
        instruction: adjustInstruction.trim(),
      });
      setAdjustInstruction('');
    } finally {
      setIsAdjusting(false);
    }
  };

  const togglePanel = (key: string) => {
    setCollapsedPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <>
    <div className="space-y-4">
      <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary">Director Chat</div>
            <h3 className="mt-1 text-base font-semibold text-text-primary">导演对话</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => togglePanel('chat')}
              className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-secondary"
            >
              {collapsedPanels.chat ? '展开' : '收起'}
            </button>
            <button
              onClick={onReset}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary"
            >
              新建故事
            </button>
          </div>
        </div>

        {collapsedPanels.chat ? null : <div className="space-y-3">
          <div className="rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {DIRECTOR_QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onInputChange(prompt)}
                    className="rounded-full border border-border-subtle bg-bg-panel px-3 py-1 text-[11px] text-text-secondary transition hover:border-[#E91E8C]/40 hover:text-text-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="max-h-[24rem] space-y-2 overflow-y-auto rounded-[16px] border border-border-subtle bg-[rgba(255,255,255,0.02)] p-3">
              {timelineMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-[rgba(233,30,140,0.14)] text-text-primary'
                      : 'border border-border-subtle bg-bg-panel text-text-secondary'
                  }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[10px] text-text-tertiary">
                      <span>{message.role === 'user' ? '你' : '导演助手'}</span>
                      {formatMessageTime(message.createdAt) ? <span>{formatMessageTime(message.createdAt)}</span> : null}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            rows={4}
            className="input w-full resize-none"
            placeholder="直接输入你的想法..."
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="rounded-xl bg-[#E91E8C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              发送
            </button>
            <button
              onClick={onConfirmWorkflow}
              disabled={!messages.length}
              className="rounded-xl bg-[#111827] px-3 py-2 text-xs text-white disabled:opacity-40"
            >
              确认生成预览
            </button>
            {busyText ? <span className="text-xs text-text-tertiary">{busyText}</span> : null}
          </div>
        </div>}
      </section>

      {compactSummary.length ? (
        <CollapsiblePanel
          title="已确认信息"
          collapsed={collapsedPanels.summary}
          onToggle={() => togglePanel('summary')}
        >
          <div className="grid gap-2">
            {compactSummary.map((item) => (
              <SummaryPill key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </CollapsiblePanel>
      ) : null}

      {scriptDraft ? (
        <CollapsiblePanel
          title="当前故事稿"
          collapsed={collapsedPanels.scriptDraft}
          onToggle={() => togglePanel('scriptDraft')}
        >
          <div className="rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-4 text-sm leading-6 text-text-primary">
            {scriptDraft}
          </div>
        </CollapsiblePanel>
      ) : null}

      {(scenes.length || characterAssets.length || sceneAssets.length || storyboardSegments.length || voiceCasting.length) ? (
        <CollapsiblePanel
          title="生产摘要"
          collapsed={collapsedPanels.production}
          onToggle={() => togglePanel('production')}
        >
          <div className="grid grid-cols-2 gap-3">
            <SummaryPill label="场景数" value={scenes.length ? `${scenes.length} 个场景` : '未生成'} />
            <SummaryPill label="角色资产" value={characterAssets.length ? `${characterAssets.length} 个角色` : '未生成'} />
            <SummaryPill label="场景资产" value={sceneAssets.length ? `${sceneAssets.length} 个场景图设定` : '未生成'} />
            <SummaryPill label="分镜片段" value={storyboardSegments.length ? `${storyboardSegments.length} 个片段` : '未生成'} />
          </div>

          {scenes.length ? (
            <div className="mt-4 space-y-2">
              {scenes.slice(0, 4).map((scene) => (
                <div key={scene.id} className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                  <div className="text-sm font-medium text-text-primary">{scene.sceneName}</div>
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    第 {scene.chapterIndex} 章 · {scene.contentType} · {scene.characters.join(' / ') || '无固定角色'}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">{scene.summary}</p>
                </div>
              ))}
            </div>
          ) : null}

          {storyboardSegments.length ? (
            <div className="mt-4 space-y-2">
              {storyboardSegments.slice(0, 4).map((segment) => (
                <div key={segment.id} className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text-primary">{segment.title}</div>
                    <div className="text-[11px] text-text-tertiary">
                      第 {segment.chapterIndex} 章 · {segment.contentType}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">{segment.summary}</p>
                  <p className="mt-1 text-[11px] leading-5 text-text-tertiary">
                    音色：{segment.characterRefs
                      .map((name) => voiceCasting.find((item) => item.characterName === name)?.voiceName || '待分配')
                      .filter(Boolean)
                      .join(' / ') || '暂无'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CollapsiblePanel>
      ) : null}

      {previews.length ? (
        <CollapsiblePanel
          title="故事方向"
          collapsed={collapsedPanels.previews}
          onToggle={() => togglePanel('previews')}
        >
          <div className="space-y-3">
            {previews.map((preview, index) => {
              const isSelected = selectedPreviewId === preview.id;
              return (
                <div
                  key={preview.id}
                  className={`rounded-[18px] border p-4 transition ${
                    isSelected
                      ? 'border-[#E91E8C] bg-[rgba(233,30,140,0.08)]'
                      : 'border-border-subtle bg-bg-panel-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
                        Take {index + 1}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-text-primary">{preview.title}</div>
                    </div>
                    <button
                      onClick={() => setDetailModal({ type: 'preview', id: preview.id })}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
                    >
                      查看细节
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-primary">{preview.openingScene}</p>
                  <p className="mt-3 text-xs leading-5 text-text-secondary">冲突：{preview.conflict}</p>
                  <p className="mt-1 text-xs leading-5 text-text-tertiary">推进：{preview.progression}</p>
                </div>
              );
            })}
          </div>
        </CollapsiblePanel>
      ) : null}

      {previewSegments.length ? (
        <CollapsiblePanel
          title="下一片段九宫格预览"
          collapsed={collapsedPanels.previewGrid}
          onToggle={() => togglePanel('previewGrid')}
        >
          <div className="grid grid-cols-3 gap-3">
            {previewSegments.map((segment, index) => {
              const confirmed = confirmedSegmentIds.includes(segment.id);
              return (
                <div key={segment.id} className="overflow-hidden rounded-[16px] border border-border-subtle bg-bg-panel-secondary">
                  <div className="aspect-video bg-[#101010]">
                    {segment.storyboardImageUrl ? (
                      <img
                        src={segment.storyboardImageUrl}
                        alt={segment.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-[11px] leading-5 text-text-tertiary">
                        预览图生成中
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] text-text-tertiary">镜头 {index + 1}</div>
                    <div className="mt-1 text-xs font-medium text-text-primary">{segment.title}</div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-text-secondary">{segment.summary}</p>
                    <button
                      onClick={() => onConfirmSegmentPreview(segment.id)}
                      disabled={confirmed}
                      className="mt-3 w-full rounded-lg bg-[#E91E8C] px-3 py-2 text-[11px] text-white disabled:opacity-40"
                    >
                      {confirmed ? '已接入短剧链路' : '确认生成这个片段'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsiblePanel>
      ) : null}

      {chapters.length ? (
        <CollapsiblePanel
          title="章节结构"
          collapsed={collapsedPanels.chapters}
          onToggle={() => togglePanel('chapters')}
        >
          <div className="space-y-3">
            {chapters.map((chapter) => (
              <div key={chapter.index} className="rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">
                      {chapterDrafts[chapter.index]?.title || chapter.title}
                    </div>
                    <div className="mt-1 text-[11px] text-text-tertiary">
                      建议分镜数：{chapterDrafts[chapter.index]?.storyboardCount || chapter.storyboardCount}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetailModal({ type: 'chapter', id: String(chapter.index) })}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
                    >
                      查看细节
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs leading-5 text-text-secondary">
                  {chapter.summary}
                </div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      ) : null}
    </div>

    {detailModal ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6">
        <div className="max-h-[82vh] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-border-subtle bg-[#151515] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
                {detailModal.type === 'preview' ? 'Story Detail' : 'Chapter Detail'}
              </div>
              <h3 className="mt-1 text-xl font-semibold text-text-primary">
                {activePreview?.title || activeChapter?.title || '细节查看'}
              </h3>
            </div>
            <button
              onClick={() => {
                setDetailModal(null);
                setAdjustInstruction('');
              }}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
            >
              关闭
            </button>
          </div>

          {activePreview ? (
            <div className="mt-5 space-y-4 text-sm leading-7 text-text-primary">
              <div>
                <div className="text-xs text-text-tertiary">开场画面</div>
                <div>{activePreview.openingScene}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">核心冲突</div>
                <div>{activePreview.conflict}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">故事推进</div>
                <div>{activePreview.progression}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">导演判断</div>
                <div>{activePreview.whyItWorks}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">首个镜头脚本</div>
                <div className="whitespace-pre-wrap">{activePreview.firstNodeScript}</div>
              </div>
            </div>
          ) : null}

          {activeChapter ? (
            <div className="mt-5 space-y-4 text-sm leading-7 text-text-primary">
              <div>
                <div className="text-xs text-text-tertiary">章节摘要</div>
                <div>{activeChapter.summary}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">章节目标</div>
                <div>{activeChapter.goal}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">建议分镜数</div>
                <div>{activeChapter.storyboardCount}</div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-4">
            <div className="text-sm font-medium text-text-primary">AI 调整</div>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              直接告诉导演你想怎么改，比如“把悬疑感加重，但不要削弱动作戏的爆发力”。
            </p>
            <textarea
              value={adjustInstruction}
              onChange={(e) => setAdjustInstruction(e.target.value)}
              rows={4}
              className="input mt-3 w-full resize-none"
              placeholder="输入你的调整要求..."
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => void handleAdjust()}
                disabled={!adjustInstruction.trim() || isAdjusting}
                className="rounded-xl bg-[#E91E8C] px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {isAdjusting ? '调整中' : '让 AI 调整'}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
