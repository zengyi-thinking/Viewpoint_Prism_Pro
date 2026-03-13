'use client';

import { useEffect, useState } from 'react';
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
  onGenerateProductionPackage: () => void;
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
  scenes,
  characterAssets,
  sceneAssets,
  storyboardSegments,
  voiceCasting,
  busyText,
  onInputChange,
  onSend,
  onReset,
  onGenerateStory,
  onGenerateChapters,
  onSelectPreview,
  onCreateChapterNodes,
  onUpdateChapter,
  onGenerateProductionPackage,
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
              onClick={onGenerateProductionPackage}
              disabled={!chapters.length}
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-secondary disabled:opacity-40"
            >
              生成生产包
            </button>
            <button
              onClick={onEnterProduction}
              disabled={!storyboardSegments.length && !chapters.length}
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

      {(scenes.length || characterAssets.length || sceneAssets.length || storyboardSegments.length || voiceCasting.length) ? (
        <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-text-primary">中间生产层</h3>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              这里对应 n8n 里的场景识别、角色/场景资产、分镜片段、台词和音色映射结果。
            </p>
          </div>
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
        </section>
      ) : null}

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
