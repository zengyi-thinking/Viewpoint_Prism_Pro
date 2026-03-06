'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MindmapViewer } from './MindmapViewer';
import { CrystalCardViewer } from './CrystalCardViewer';
import { OutlinePanel } from './OutlinePanel';
import { FlashcardsPanel } from './FlashcardsPanel';
import { RealtimeKnowledgeBoard } from './RealtimeKnowledgeBoard';
import { knowledgeApi } from '@/services/knowledge.api';
import type { MindmapResult } from '@/types/mindmap';
import { Loader2 } from 'lucide-react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import type {
  KnowledgeBoardSnapshotResponse,
  KnowledgeDeepAnalysisResponse,
  KnowledgeSettlementResponse,
} from '@/services/knowledge.api';

interface KnowledgeBoardProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

/**
 * 知识棱镜控制面板
 */
export function KnowledgeBoard({ videoId, onTimeClick }: KnowledgeBoardProps) {
  const currentVideo = useWorkbenchStore((s) => s.currentVideo);
  const projectId =
    currentVideo && currentVideo.id === videoId ? currentVideo.projectId : undefined;
  const [mindmap, setMindmap] = useState<MindmapResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncingTarget, setIsSyncingTarget] = useState<'notion' | 'feishu' | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [isAnalyzingCurrent, setIsAnalyzingCurrent] = useState(false);
  const [settlement, setSettlement] = useState<KnowledgeSettlementResponse | null>(null);
  const [boardSnapshot, setBoardSnapshot] = useState<KnowledgeBoardSnapshotResponse | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<KnowledgeDeepAnalysisResponse['deepAnalysis'] | null>(null);
  const [backgroundFacts, setBackgroundFacts] = useState<Array<Record<string, unknown>>>([]);
  const [ambiguities, setAmbiguities] = useState<Array<Record<string, unknown>>>([]);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settleHint, setSettleHint] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'realtime' | 'mindmap' | 'crystal-cards' | 'outline' | 'flashcards'>('realtime');

  const isExpectedVideoAccessError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return (
      message.includes('视频不存在或无访问权限') ||
      message.includes('video does not exist') ||
      message.includes('access')
    );
  };

  useEffect(() => {
    if (!videoId) return;
    loadMindmap();
    void loadBoardSnapshot();
    void loadDeepAnalysis();
    void loadBackgroundFacts();
    setSettlement(null);
    setSettleHint('');
  }, [videoId]);

  const loadMindmap = async () => {
    try {
      setIsLoading(true);
      const response = await knowledgeApi.getMindmap(videoId);
      setMindmap(response.mindmap);
    } catch (error) {
      setMindmap(null);
      if (!isExpectedVideoAccessError(error)) {
        console.error('加载思维导图失败:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadBoardSnapshot = async () => {
    try {
      const response = await knowledgeApi.getBoardSnapshot(videoId);
      setBoardSnapshot(response);
    } catch (error) {
      setBoardSnapshot(null);
      if (!isExpectedVideoAccessError(error)) {
        console.error('加载知识看板快照失败:', error);
      }
    }
  };

  const loadDeepAnalysis = async () => {
    try {
      const response = await knowledgeApi.getDeepAnalysis(videoId);
      setDeepAnalysis(response.deepAnalysis);
    } catch (error) {
      setDeepAnalysis(null);
      if (!isExpectedVideoAccessError(error)) {
        console.error('加载深度分析失败:', error);
      }
    }
  };

  const loadBackgroundFacts = async () => {
    try {
      const response = await knowledgeApi.getBackgroundFacts(videoId);
      setBackgroundFacts(response.items ?? []);
      setAmbiguities(response.ambiguities ?? []);
    } catch (error) {
      setBackgroundFacts([]);
      setAmbiguities([]);
      if (!isExpectedVideoAccessError(error)) {
        console.error('加载背景知识失败:', error);
      }
    }
  };

  const handleGenerateMindmap = async () => {
    try {
      setIsGenerating(true);
      await knowledgeApi.generateMindmap(videoId, {
        maxDepth: 5,
        maxNodes: 90,
      });
      await loadMindmap();
    } catch (error) {
      console.error('生成思维导图失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportMindmap = async (format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind') => {
    try {
      const response = await knowledgeApi.exportMindmap(videoId, format);

      // 创建下载链接
      const blob = new Blob([response.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindmap-${videoId}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出思维导图失败:', error);
    }
  };

  const handleSync = async (target: 'notion' | 'feishu') => {
    try {
      setIsSyncingTarget(target);
      const result = await knowledgeApi.export(videoId, { target });
      setSettlement(result);
      if (result.sync[target]?.success) {
        const mode = result.sync[target]?.mode;
        setSettleHint(mode === 'dry-run' ? `${target} 已生成同步模板（dry-run）` : `${target} 同步完成`);
      } else {
        setSettleHint(`${target} 同步失败：${result.sync[target]?.reason || 'unknown error'}`);
      }
    } catch (error) {
      console.error(`同步到 ${target} 失败:`, error);
      setSettleHint(`${target} 同步失败`);
    } finally {
      setIsSyncingTarget(null);
    }
  };

  const handleAnalyzeCurrent = async () => {
    try {
      setIsAnalyzingCurrent(true);
      setSettleHint('已提交当前视频分析任务，正在处理...');
      await knowledgeApi.analyze(videoId, { includeDeepAnalysis: true });
      await Promise.all([loadBoardSnapshot(), loadDeepAnalysis(), loadBackgroundFacts()]);
      setSettleHint('当前视频分析完成，可继续生成结算产物。');
    } catch (error: any) {
      console.error('分析当前视频失败:', error);
      setSettleHint(`分析失败：${error?.message || 'unknown error'}`);
    } finally {
      setIsAnalyzingCurrent(false);
    }
  };

  const handleDeepAnalyze = async () => {
    try {
      setIsDeepAnalyzing(true);
      setSettleHint('正在重建知识棱镜的二次理解层...');
      await knowledgeApi.regenerateDeepAnalysis(videoId, {});
      await Promise.all([loadBoardSnapshot(), loadDeepAnalysis(), loadBackgroundFacts(), loadMindmap()]);
      setSettleHint('深度分析完成，思维导图和学习资产可基于新理解继续生成。');
    } catch (error: any) {
      console.error('深度分析失败:', error);
      setSettleHint(`深度分析失败：${error?.message || 'unknown error'}`);
    } finally {
      setIsDeepAnalyzing(false);
    }
  };

  const handleSettle = async () => {
    try {
      setIsSettling(true);
      const result = await knowledgeApi.settle(videoId, {});
      setSettlement(result);
      setSettleHint(`结算完成：闪卡 ${result.output.flashcards.length}，关键帧 ${result.output.keyframes.length}`);
    } catch (error) {
      console.error('一键结算失败:', error);
      setSettleHint('一键结算失败');
    } finally {
      setIsSettling(false);
    }
  };

  const downloadText = (content: string, fileName: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full">
        <div className="border-b">
          <div className="flex items-center justify-between gap-2 px-3">
            <TabsList className="w-full justify-start rounded-none h-12 px-1">
              <TabsTrigger value="realtime" className="data-[state=active]:bg-background">
                实时看板
              </TabsTrigger>
              <TabsTrigger value="crystal-cards" className="data-[state=active]:bg-background">
              晶体卡片
              </TabsTrigger>
              <TabsTrigger value="mindmap" className="data-[state=active]:bg-background">
              思维导图
              </TabsTrigger>
              <TabsTrigger value="outline" className="data-[state=active]:bg-background">
              知识大纲
              </TabsTrigger>
              <TabsTrigger value="flashcards" className="data-[state=active]:bg-background">
              学习卡片
              </TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => void handleSettle()}
                disabled={isSettling || isSyncingTarget !== null || isAnalyzingCurrent}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                title="一键结算（生成三大产物）"
              >
                {isSettling ? '结算中...' : '一键结算'}
              </button>
              <button
                onClick={() => void handleAnalyzeCurrent()}
                disabled={isSettling || isSyncingTarget !== null || isAnalyzingCurrent}
                className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary transition hover:text-text-secondary disabled:opacity-50"
                title="分析当前视频"
              >
                {isAnalyzingCurrent ? '分析中...' : '分析当前视频'}
              </button>
              <button
                onClick={() => void handleDeepAnalyze()}
                disabled={
                  isSettling ||
                  isSyncingTarget !== null ||
                  isAnalyzingCurrent ||
                  isDeepAnalyzing
                }
                className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                title="生成二次理解层"
              >
                {isDeepAnalyzing ? '深度分析中...' : '深度分析'}
              </button>
              <button
                onClick={() => void handleSync('notion')}
                disabled={isSyncingTarget !== null || isSettling}
                className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary transition hover:text-text-secondary disabled:opacity-50"
                title="Sync to Notion"
              >
                {isSyncingTarget === 'notion' ? 'Syncing...' : 'Sync to Notion'}
              </button>
              <button
                onClick={() => void handleSync('feishu')}
                disabled={isSyncingTarget !== null || isSettling}
                className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary transition hover:text-text-secondary disabled:opacity-50"
                title="Sync to 飞书"
              >
                {isSyncingTarget === 'feishu' ? 'Syncing...' : 'Sync to 飞书'}
              </button>
            </div>
          </div>
        </div>
        {(settleHint || settlement) ? (
          <div className="border-b px-3 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-text-tertiary truncate">
                {settleHint || '结算产物已准备完成'}
              </p>
              {settlement ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      downloadText(
                        settlement.output.markdownPackage.content,
                        settlement.output.markdownPackage.fileName,
                        'text/markdown;charset=utf-8',
                      )
                    }
                    className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary transition hover:text-text-secondary"
                  >
                    下载结算包
                  </button>
                  <button
                    onClick={() =>
                      downloadText(
                        settlement.output.notesMarkdown,
                        `notes-${videoId}.md`,
                        'text/markdown;charset=utf-8',
                      )
                    }
                    className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary transition hover:text-text-secondary"
                  >
                    下载笔记
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {boardSnapshot || deepAnalysis ? (
          <div className="border-b px-3 py-2">
            <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
              <span>Board: {boardSnapshot?.state ?? 'idle'}</span>
              <span>关键帧洞察: {boardSnapshot?.stats.frameInsights ?? 0}</span>
              <span>
                深度理解:
                {' '}
                {deepAnalysis ? `v${deepAnalysis.version} / ${deepAnalysis.status}` : 'PENDING'}
              </span>
            </div>
            {deepAnalysis?.summary ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-text-secondary">
                {deepAnalysis.summary}
              </p>
            ) : null}
            {backgroundFacts.length > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium text-text-tertiary">背景知识补充</p>
                <div className="flex flex-wrap gap-1.5">
                  {backgroundFacts.slice(0, 4).map((fact, index) => {
                    const title =
                      typeof fact.title === 'string'
                        ? fact.title
                        : typeof fact.topic === 'string'
                          ? fact.topic
                          : `背景点 ${index + 1}`;
                    return (
                      <span
                        key={`${title}-${index}`}
                        className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200"
                      >
                        {title}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {ambiguities.length > 0 ? (
              <div className="mt-2">
                <p className="text-[10px] font-medium text-text-tertiary">易混淆点</p>
                <ul className="mt-1 space-y-1 text-[11px] text-text-secondary">
                  {ambiguities.slice(0, 2).map((item, index) => {
                    const concept =
                      typeof item.concept === 'string' ? item.concept : `问题 ${index + 1}`;
                    const clarification =
                      typeof item.clarification === 'string' ? item.clarification : '';
                    return (
                      <li key={`${concept}-${index}`} className="line-clamp-2">
                        {concept}
                        {clarification ? `：${clarification}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <TabsContent value="realtime" className="flex-1 m-0 p-0 overflow-hidden">
          <RealtimeKnowledgeBoard
            projectId={projectId}
            videoId={videoId}
            onTimeClick={onTimeClick}
            onAnalyzeCurrent={handleAnalyzeCurrent}
            isAnalyzingCurrent={isAnalyzingCurrent}
          />
        </TabsContent>

        <TabsContent value="crystal-cards" className="flex-1 m-0 p-0 overflow-hidden">
          <CrystalCardViewer videoId={videoId} onTimeClick={onTimeClick} />
        </TabsContent>

        <TabsContent value="mindmap" className="flex-1 m-0 p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MindmapViewer
              mindmap={mindmap}
              onGenerate={handleGenerateMindmap}
              isGenerating={isGenerating}
              videoId={videoId}
              onTimeClick={onTimeClick}
              onExport={handleExportMindmap}
            />
          )}
        </TabsContent>

        <TabsContent value="outline" className="flex-1 m-0 p-0 overflow-hidden">
          <OutlinePanel videoId={videoId} onTimeClick={onTimeClick} />
        </TabsContent>

        <TabsContent value="flashcards" className="flex-1 m-0 p-0 overflow-hidden">
          <FlashcardsPanel videoId={videoId} onTimeClick={onTimeClick} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
