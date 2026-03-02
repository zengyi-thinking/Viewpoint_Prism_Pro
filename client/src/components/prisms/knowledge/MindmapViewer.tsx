'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MindmapNode, MindmapResult } from '@/types/mindmap';
import { Button } from '@/components/ui/button';
import { useWorkbenchStore } from '@/stores/workbench.store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MindmapViewerProps {
  mindmap: MindmapResult | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
  videoId?: string;
  onTimeClick?: (timestamp: number) => void;
  onExport?: (
    format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind',
  ) => void;
}

type ViewMode = 'mindmap' | 'mermaid' | 'markdown';

type PositionedNode = {
  id: string;
  content: string;
  level: number;
  x: number;
  y: number;
  metadata?: MindmapNode['metadata'];
  parentId?: string;
};

type Edge = {
  from: string;
  to: string;
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;
const X_GAP = 260;
const Y_GAP = 100;
const CANVAS_PADDING = 120;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTimecode(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const hms = text.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = Number(hms[3]);
    if ([h, m, s].every(Number.isFinite)) return h * 3600 + m * 60 + s;
  }

  const ms = text.match(/\b(\d{1,3}):(\d{2})\b/);
  if (ms) {
    const m = Number(ms[1]);
    const s = Number(ms[2]);
    if ([m, s].every(Number.isFinite)) return m * 60 + s;
  }

  return null;
}

function extractSecondsFromText(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const timecode = parseTimecode(text);
  if (timecode !== null) return timecode;

  const secMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)\b/i);
  if (secMatch) {
    const n = Number(secMatch[1]);
    if (Number.isFinite(n)) return n;
  }

  const plain = text.match(/^\d+(?:\.\d+)?$/);
  if (plain) {
    const n = Number(plain[0]);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) return null;
    // Guard for accidental millisecond values from model output.
    return value > 10000 ? value / 1000 : value;
  }
  if (typeof value === 'string') {
    return extractSecondsFromText(value);
  }
  return null;
}

function buildMindmapLayout(root: MindmapNode) {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];

  const place = (
    node: MindmapNode,
    depth: number,
    topY: number,
    parentId?: string,
  ): { y: number; nextY: number } => {
    const children = node.children ?? [];
    const x = CANVAS_PADDING + depth * X_GAP;

    if (children.length === 0) {
      const y = topY;
      nodes.push({
        id: node.id,
        content: node.content,
        level: node.level ?? depth,
        x,
        y,
        metadata: node.metadata,
        parentId,
      });
      if (parentId) edges.push({ from: parentId, to: node.id });
      return { y, nextY: topY + Y_GAP };
    }

    let cursor = topY;
    const childYs: number[] = [];
    for (const child of children) {
      const placed = place(child, depth + 1, cursor, node.id);
      cursor = placed.nextY;
      childYs.push(placed.y);
    }

    const y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    nodes.push({
      id: node.id,
      content: node.content,
      level: node.level ?? depth,
      x,
      y,
      metadata: node.metadata,
      parentId,
    });
    if (parentId) edges.push({ from: parentId, to: node.id });

    return { y, nextY: cursor };
  };

  place(root, 0, CANVAS_PADDING);

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 0);

  const width = maxX + NODE_WIDTH + CANVAS_PADDING;
  const height = maxY + NODE_HEIGHT + CANVAS_PADDING;

  const byId = new Map<string, PositionedNode>();
  for (const node of nodes) byId.set(node.id, node);

  return {
    nodes,
    edges,
    byId,
    width,
    height,
  };
}

function pathBetween(a: PositionedNode, b: PositionedNode) {
  const startX = a.x + NODE_WIDTH / 2;
  const startY = a.y;
  const endX = b.x - NODE_WIDTH / 2;
  const endY = b.y;
  const c1X = startX + 36;
  const c1Y = startY;
  const c2X = endX - 36;
  const c2Y = endY;
  return `M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`;
}

/**
 * 思维导图可视化组件
 * 支持：真实节点连线渲染、缩放、全屏、导出。
 */
export function MindmapViewer({
  mindmap,
  onGenerate,
  isGenerating = false,
  videoId,
  onTimeClick,
  onExport,
}: MindmapViewerProps) {
  const requestSeekTo = useWorkbenchStore((s) => s.requestSeekTo);
  const [viewMode, setViewMode] = useState<ViewMode>('mindmap');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });

  const layout = useMemo(
    () => (mindmap ? buildMindmapLayout(mindmap.json) : null),
    [mindmap],
  );

  const selectedNodeData = useMemo(() => {
    if (!layout || !selectedNode) return null;
    return layout.byId.get(selectedNode) ?? null;
  }, [layout, selectedNode]);

  const childrenByParent = useMemo(() => {
    if (!layout) return new Map<string, PositionedNode[]>();
    const map = new Map<string, PositionedNode[]>();
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const current = map.get(node.parentId) ?? [];
      current.push(node);
      map.set(node.parentId, current);
    }
    return map;
  }, [layout]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    setSelectedNode(null);
    setZoom(1);
  }, [mindmap?.json?.id]);

  useEffect(() => {
    if (!jumpNotice) return;
    const timer = window.setTimeout(() => setJumpNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [jumpNotice]);

  useEffect(() => {
    if (!isPanning) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!panRef.current.active || !viewportRef.current) return;
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      viewportRef.current.scrollLeft = panRef.current.startScrollLeft - dx;
      viewportRef.current.scrollTop = panRef.current.startScrollTop - dy;
    };

    const stopPanning = () => {
      panRef.current.active = false;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopPanning);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopPanning);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isPanning]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      canvasRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleExport = (
    format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind',
  ) => {
    onExport?.(format);
  };

  const getNodeTimestamp = (node: PositionedNode): number | null => {
    const direct = normalizeTimestamp(node.metadata?.timestamp);
    if (direct !== null) return direct;

    const fromSegment = normalizeTimestamp(node.metadata?.transcriptSegment);
    if (fromSegment !== null) return fromSegment;

    return extractSecondsFromText(node.content);
  };

  const resolveJumpTimestamp = (nodeId: string): number | null => {
    if (!layout) return null;
    const start = layout.byId.get(nodeId);
    if (!start) return null;

    const direct = getNodeTimestamp(start);
    if (direct !== null) return direct;

    // Prefer descendant timestamps for chapter/topic nodes.
    const queue = [...(childrenByParent.get(start.id) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      const hit = getNodeTimestamp(cur);
      if (hit !== null) return hit;
      queue.push(...(childrenByParent.get(cur.id) ?? []));
    }

    // Fallback to nearest ancestor timestamps.
    let parentId = start.parentId;
    while (parentId) {
      const parent = layout.byId.get(parentId);
      if (!parent) break;
      const hit = getNodeTimestamp(parent);
      if (hit !== null) return hit;
      parentId = parent.parentId;
    }

    return null;
  };

  const jumpToNodeTime = (nodeId: string, silentWhenMissing = false) => {
    const ts = resolveJumpTimestamp(nodeId);
    if (ts === null) {
      if (!silentWhenMissing) {
        setJumpNotice('This node has no resolvable timestamp.');
      }
      return;
    }

    const target = Math.max(0, ts);
    if (onTimeClick) {
      onTimeClick(target);
    } else {
      // Fallback for integration gaps: dispatch directly to player.
      requestSeekTo(target);
    }
    setJumpNotice(`Jumped to ${formatTime(target)}`);
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

  const renderMindmapView = () => {
    if (!mindmap || !layout) return null;

    return (
      <div
        ref={viewportRef}
        onMouseDown={(e) => {
          if (e.button !== 0 || !viewportRef.current) return;
          const target = e.target as HTMLElement;
          if (target.closest('[data-mindmap-node="true"]')) return;

          panRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            startScrollLeft: viewportRef.current.scrollLeft,
            startScrollTop: viewportRef.current.scrollTop,
          };
          setIsPanning(true);
          e.preventDefault();
        }}
        className={cn(
          'relative h-full w-full overflow-auto rounded-md border border-border-subtle bg-bg-panel-secondary',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        title="拖拽空白区域可移动导图；双击带时间戳节点可跳转视频"
      >
        <div
          className="relative origin-top-left"
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <svg
              width={layout.width}
              height={layout.height}
              className="absolute inset-0 pointer-events-none"
            >
              {layout.edges.map((edge) => {
                const from = layout.byId.get(edge.from);
                const to = layout.byId.get(edge.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={pathBetween(from, to)}
                    fill="none"
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1.4}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((node) => {
              const isRoot = node.parentId === undefined;
              const isSelected = selectedNode === node.id;

              return (
                <button
                  key={node.id}
                  type="button"
                  data-mindmap-node="true"
                  onClick={() => {
                    setSelectedNode(isSelected ? null : node.id);
                    // User expectation: click node should jump when timestamp is available.
                    jumpToNodeTime(node.id, true);
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNode(node.id);
                    jumpToNodeTime(node.id, false);
                  }}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-left shadow-sm transition',
                    isRoot
                      ? 'bg-gradient-to-r from-[#FF6B35]/20 to-[#E91E8C]/20 border-[#FF6B35]/40'
                      : 'bg-bg-panel border-border-subtle hover:border-[#FF6B35]/40',
                    isSelected && 'ring-2 ring-[#FF6B35]/40',
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                    minHeight: NODE_HEIGHT,
                  }}
                >
                  <div className="line-clamp-2 text-[12px] font-medium text-text-primary">
                    {node.content}
                  </div>
                  {node.metadata?.timestamp !== undefined && (
                    <div className="mt-1 text-[10px] text-text-tertiary">
                      {Math.floor(node.metadata.timestamp)}s
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
          {jumpNotice && (
            <span className="text-xs text-text-tertiary">{jumpNotice}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mindmap">导图</SelectItem>
              <SelectItem value="mermaid">Mermaid</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
            </SelectContent>
          </Select>

          {viewMode === 'mindmap' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setZoom((z) => clamp(z - 0.1, 0.6, 2))}
                className="h-8 w-8 p-0"
                title="缩小"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-12 text-center text-xs text-text-tertiary">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setZoom((z) => clamp(z + 0.1, 0.6, 2))}
                className="h-8 w-8 p-0"
                title="放大"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </>
          )}

          {onGenerate && (
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerate}
              disabled={isGenerating}
              className="h-8"
            >
              <RefreshCw
                className={cn('w-4 h-4 mr-1', isGenerating && 'animate-spin')}
              />
              生成
            </Button>
          )}

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
                <RefreshCw
                  className={cn('w-4 h-4 mr-2', isGenerating && 'animate-spin')}
                />
                生成思维导图
              </Button>
            )}
          </div>
        ) : viewMode === 'mindmap' ? (
          renderMindmapView()
        ) : viewMode === 'mermaid' ? (
          renderMermaidView()
        ) : (
          renderMarkdownView()
        )}
      </div>

      {/* 节点详情 */}
      {selectedNodeData && (
        <div className="p-3 border-t text-sm">
          <p className="font-medium text-text-primary">
            {selectedNodeData.content}
          </p>
          {selectedNodeData.metadata?.timestamp !== undefined && (
            <p className="text-text-tertiary">
              时间戳: {Math.floor(selectedNodeData.metadata.timestamp)} 秒
            </p>
          )}
          {selectedNodeData.metadata?.keyframeUrl && (
            <p className="text-text-tertiary truncate">
              关键帧: {selectedNodeData.metadata.keyframeUrl}
            </p>
          )}
          {selectedNodeData.metadata?.timestamp !== undefined && (
            <p className="text-text-tertiary mt-1">
              双击该节点可跳转到对应视频片段
            </p>
          )}
        </div>
      )}
    </div>
  );
}
