'use client';

import { useEffect, useRef, useState } from 'react';
import type { MindmapNode, MindmapResult } from '@/types/mindmap';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MindmapViewerProps {
  mindmap: MindmapResult | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
  videoId?: string;
  onExport?: (format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind') => void;
}

type ViewMode = 'tree' | 'mermaid' | 'markdown';

/**
 * 思维导图可视化组件
 */
export function MindmapViewer({
  mindmap,
  onGenerate,
  isGenerating = false,
  videoId,
  onExport,
}: MindmapViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      canvasRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleExport = (format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind') => {
    onExport?.(format);
  };

  const renderTreeView = (node: MindmapNode, depth = 0) => {
    const isSelected = selectedNode === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className={cn('mb-1', depth > 0 && 'ml-4')}>
        <div
          className={cn(
            'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
            'hover:bg-accent/50',
            isSelected && 'bg-accent',
          )}
          style={{ marginLeft: `${depth * 16}px` }}
          onClick={() => setSelectedNode(isSelected ? null : node.id)}
        >
          {hasChildren && (
            <span className="text-muted-foreground">
              {isSelected ? '▼' : '▶'}
            </span>
          )}
          <span className="font-medium text-sm">{node.content}</span>
          {node.metadata?.timestamp !== undefined && (
            <span className="text-xs text-muted-foreground">
              {Math.floor(node.metadata.timestamp)}s
            </span>
          )}
        </div>
        {isSelected && hasChildren && (
          <div className="mt-1">
            {node.children!.map((child) => renderTreeView(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderMermaidView = () => {
    if (!mindmap) return null;

    return (
      <div className="p-4 bg-muted rounded-md overflow-auto max-h-full">
        <pre className="text-sm font-mono whitespace-pre-wrap">
          {mindmap.mermaid}
        </pre>
      </div>
    );
  };

  const renderMarkdownView = () => {
    if (!mindmap) return null;

    return (
      <div className="p-4 bg-muted rounded-md overflow-auto max-h-full">
        <pre className="text-sm whitespace-pre-wrap">{mindmap.markdown}</pre>
      </div>
    );
  };

  return (
    <div
      ref={canvasRef}
      className={cn(
        'flex flex-col h-full bg-background',
        isFullscreen && 'fixed inset-0 z-50',
      )}
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">思维导图</h3>
          {mindmap && (
            <span className="text-sm text-muted-foreground">
              ({mindmap.nodeCount} 个节点)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tree">树形</SelectItem>
              <SelectItem value="mermaid">Mermaid</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
            </SelectContent>
          </Select>

          {/* 生成按钮 */}
          {onGenerate && (
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerate}
              disabled={isGenerating}
              className="h-8"
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', isGenerating && 'animate-spin')} />
              生成
            </Button>
          )}

          {/* 导出按钮 */}
          {mindmap && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('markdown')}
                className="h-8"
              >
                <Download className="w-4 h-4 mr-1" />
                下载MD
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('json')}
                className="h-8"
              >
                <Download className="w-4 h-4 mr-1" />
                下载JSON
              </Button>
              <Select onValueChange={(v) => handleExport(v as any)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue placeholder="更多导出" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="mermaid">Mermaid</SelectItem>
                  <SelectItem value="xmind">XMind</SelectItem>
                  <SelectItem value="freemind">FreeMind</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* 全屏按钮 */}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {!mindmap ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground mb-4">暂无思维导图</p>
            {onGenerate && (
              <Button onClick={onGenerate} disabled={isGenerating}>
                <RefreshCw className={cn('w-4 h-4 mr-2', isGenerating && 'animate-spin')} />
                生成思维导图
              </Button>
            )}
          </div>
        ) : viewMode === 'tree' ? (
          <div className="max-w-full">{renderTreeView(mindmap.json)}</div>
        ) : viewMode === 'mermaid' ? (
          renderMermaidView()
        ) : (
          renderMarkdownView()
        )}
      </div>

      {/* 节点详情 */}
      {selectedNode && mindmap && (
        <div className="p-3 border-t">
          {(() => {
            const findNode = (node: MindmapNode): MindmapNode | null => {
              if (node.id === selectedNode) return node;
              if (node.children) {
                for (const child of node.children) {
                  const found = findNode(child);
                  if (found) return found;
                }
              }
              return null;
            };
            const node = findNode(mindmap.json);
            return node ? (
              <div className="text-sm">
                <p className="font-medium">{node.content}</p>
                {node.metadata?.timestamp !== undefined && (
                  <p className="text-muted-foreground">
                    时间戳: {Math.floor(node.metadata.timestamp)}秒
                  </p>
                )}
                {node.metadata?.keyframeUrl && (
                  <p className="text-muted-foreground">
                    关键帧: {node.metadata.keyframeUrl}
                  </p>
                )}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
