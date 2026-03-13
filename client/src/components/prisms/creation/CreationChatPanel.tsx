'use client';

import { useEffect, useState } from 'react';
import { CreationConversationMessage, IdeaPreviewOption, ScriptPlanChapter } from '@/services/creation.api';

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
  busyText?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
  onGenerateStory: () => void;
  onGenerateChapters: () => void;
  onSelectPreview: (previewId: string) => void;
  onCreateChapterNodes: (chapterIndex: number) => void;
  onUpdateChapter: (
    chapterIndex: number,
    payload: Partial<Pick<ScriptPlanChapter, 'title' | 'summary' | 'goal' | 'storyboardCount'>>,
  ) => void;
  onEnterProduction: () => void;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-panel-secondary px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">{label}</div>
      <p className="mt-2 text-sm leading-6 text-text-primary">{value || '等待对话归纳'}</p>
    </div>
  );
}

export function CreationChatPanel({
  messages,
  input,
  summary,
  scriptDraft,
  previews,
  selectedPreviewId,
  chapters,
  busyText,
  onInputChange,
  onSend,
  onReset,
  onGenerateStory,
  onGenerateChapters,
  onSelectPreview,
  onCreateChapterNodes,
  onUpdateChapter,
  onEnterProduction,
}: CreationChatPanelProps) {
  const [chapterDrafts, setChapterDrafts] = useState<Record<number, ScriptPlanChapter>>({});

  useEffect(() => {
    setChapterDrafts(
      Object.fromEntries(
        chapters.map((chapter) => [
          chapter.index,
          {
            ...chapter,
          },
        ]),
      ),
    );
  }, [chapters]);

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">导演对话区</h3>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              用自然语言持续描述故事、风格、角色、节奏和拆分偏好。第一版先把对话归纳到现有故事方向与章节解析链路。
            </p>
          </div>
          <button
            onClick={onReset}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary"
          >
            新建故事
          </button>
        </div>

        <div className="space-y-3">
          <div className="max-h-[18rem] space-y-3 overflow-y-auto rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-3">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-subtle px-3 py-4 text-xs leading-6 text-text-tertiary">
                先告诉我你要做什么类型的视频，例如“一个赛博武侠短片，3 章结构，写实电影感，动作戏多一些”。
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl px-3 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-6 bg-[rgba(233,30,140,0.12)] text-text-primary'
                      : 'mr-6 border border-border-subtle bg-bg-panel text-text-secondary'
                  }`}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>

          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            rows={4}
            className="input w-full resize-none"
            placeholder="继续补充：故事梗概、艺术风格、角色关系、章节数量、单章时长、镜头节奏、文戏/武戏比例……"
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
              onClick={onGenerateStory}
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-secondary"
            >
              归纳成故事方向
            </button>
            <button
              onClick={onGenerateChapters}
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-secondary"
            >
              归纳成章节结构
            </button>
            <button
              onClick={onEnterProduction}
              disabled={!chapters.length}
              className="rounded-xl bg-[#111827] px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              进入生产
            </button>
            {busyText ? <span className="text-xs text-text-tertiary">{busyText}</span> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">已确认信息摘要</h3>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">
            当前按对话内容自动归纳，后续会替换成真正的对话 Agent 结构化结果。
          </p>
        </div>
        <SummaryPill label="故事意图" value={summary.storyIntent} />
        <SummaryPill label="艺术风格" value={summary.visualStyle} />
        <SummaryPill label="拆分偏好" value={summary.splitPreference} />
      </section>

      <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-text-primary">当前剧本版本</h3>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">
            这是当前对话自动汇总出来的主故事稿，后续章节结构会以它为准继续拆解。
          </p>
        </div>
        <div className="rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-4 text-sm leading-6 text-text-primary">
          {scriptDraft || '等待对话生成完整剧本。'}
        </div>
      </section>

      {previews.length ? (
        <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-text-primary">故事方向预览</h3>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              对话摘要已送入现有故事生成链路，确认后会创建首节点并进入画布。
            </p>
          </div>
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
                      onClick={() => onSelectPreview(preview.id)}
                      className="rounded-lg bg-[#E91E8C] px-3 py-1.5 text-xs text-white"
                    >
                      确认方向
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-primary">{preview.openingScene}</p>
                  <p className="mt-3 text-xs leading-5 text-text-secondary">冲突：{preview.conflict}</p>
                  <p className="mt-1 text-xs leading-5 text-text-tertiary">推进：{preview.progression}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {chapters.length ? (
        <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-text-primary">章节结构</h3>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              对话摘要已送入现有章节解析链路。先选章，再继续往右侧画布拆分镜头。
            </p>
          </div>
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
                      onClick={() => onUpdateChapter(chapter.index, chapterDrafts[chapter.index] || chapter)}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
                    >
                      保存章节
                    </button>
                    <button
                      onClick={() => onCreateChapterNodes(chapter.index)}
                      className="rounded-lg bg-[#E91E8C] px-3 py-1.5 text-xs text-white"
                    >
                      创建本章节点
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <input
                    value={chapterDrafts[chapter.index]?.title || ''}
                    onChange={(e) =>
                      setChapterDrafts((prev) => ({
                        ...prev,
                        [chapter.index]: {
                          ...(prev[chapter.index] || chapter),
                          title: e.target.value,
                        },
                      }))
                    }
                    className="input w-full"
                    placeholder="章节标题"
                  />
                  <textarea
                    value={chapterDrafts[chapter.index]?.summary || ''}
                    onChange={(e) =>
                      setChapterDrafts((prev) => ({
                        ...prev,
                        [chapter.index]: {
                          ...(prev[chapter.index] || chapter),
                          summary: e.target.value,
                        },
                      }))
                    }
                    rows={3}
                    className="input w-full resize-none"
                    placeholder="章节摘要"
                  />
                  <input
                    value={chapterDrafts[chapter.index]?.goal || ''}
                    onChange={(e) =>
                      setChapterDrafts((prev) => ({
                        ...prev,
                        [chapter.index]: {
                          ...(prev[chapter.index] || chapter),
                          goal: e.target.value,
                        },
                      }))
                    }
                    className="input w-full"
                    placeholder="章节目标"
                  />
                  <input
                    value={String(chapterDrafts[chapter.index]?.storyboardCount || chapter.storyboardCount)}
                    onChange={(e) =>
                      setChapterDrafts((prev) => ({
                        ...prev,
                        [chapter.index]: {
                          ...(prev[chapter.index] || chapter),
                          storyboardCount: Math.max(2, Math.min(6, Number(e.target.value || 3))),
                        },
                      }))
                    }
                    type="number"
                    min={2}
                    max={6}
                    className="input w-full"
                    placeholder="建议分镜数"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
