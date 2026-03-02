'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MindmapViewer } from './MindmapViewer';
import { CrystalCardViewer } from './CrystalCardViewer';
import { knowledgeApi } from '@/services/knowledge.api';
import type { MindmapResult } from '@/types/mindmap';
import { Loader2 } from 'lucide-react';

interface KnowledgeBoardProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

/**
 * 知识棱镜控制面板
 */
export function KnowledgeBoard({ videoId, onTimeClick }: KnowledgeBoardProps) {
  const [mindmap, setMindmap] = useState<MindmapResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mindmap' | 'crystal-cards' | 'outline' | 'flashcards'>('crystal-cards');

  useEffect(() => {
    loadMindmap();
  }, [videoId]);

  const loadMindmap = async () => {
    try {
      setIsLoading(true);
      const response = await knowledgeApi.getMindmap(videoId);
      setMindmap(response.mindmap);
    } catch (error) {
      console.error('加载思维导图失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMindmap = async () => {
    try {
      setIsGenerating(true);
      await knowledgeApi.generateMindmap(videoId, {
        maxDepth: 4,
        maxNodes: 50,
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

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full">
        <div className="border-b">
          <TabsList className="w-full justify-start rounded-none h-12 px-4">
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
        </div>

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
              onExport={handleExportMindmap}
            />
          )}
        </TabsContent>

        <TabsContent value="outline" className="flex-1 m-0 p-4 overflow-auto">
          <div className="text-sm text-muted-foreground">
            知识大纲功能开发中...
          </div>
        </TabsContent>

        <TabsContent value="flashcards" className="flex-1 m-0 p-4 overflow-auto">
          <div className="text-sm text-muted-foreground">
            学习卡片功能开发中...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
