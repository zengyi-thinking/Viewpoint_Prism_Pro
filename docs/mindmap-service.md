# 思维导图生成服务

## 概述

思维导图生成服务是 Viewpoint Prism Pro 知识棱镜的核心功能之一，它能够基于视频的转写内容和关键帧自动生成结构化的思维导图，帮助用户快速理解视频内容结构。

## 功能特性

### 1. 自动生成思维导图
- 基于视频转写内容自动分析主题结构
- 结合关键帧信息增强可视化效果
- 支持自定义最大深度和节点数量
- AI 驱动的智能内容提取和分类

### 2. 多种视图模式
- **树形视图**: 层级化的节点树展示，支持展开/折叠
- **Mermaid 视图**: 标准 Mermaid 格式，便于集成其他工具
- **Markdown 视图**: Markdown 列表格式，易于编辑和分享

### 3. 多格式导出
- **JSON**: 结构化数据，便于二次开发
- **Markdown**: 通用文档格式
- **Mermaid**: 流程图工具兼容格式
- **XMind**: 专业思维导图软件格式
- **FreeMind**: 开源思维导图工具格式

### 4. 对话集成
- 支持通过对话窗口触发思维导图生成
- 可基于对话上下文定制思维导图内容
- 自动关联当前视频的知识资产

## API 接口

### 生成思维导图

```
POST /api/prism/knowledge/videos/:videoId/mindmap
```

**请求参数:**
```typescript
interface GenerateMindmapDto {
  sessionId?: string;    // 可选：从对话生成时使用
  prompt?: string;       // 可选：自定义生成提示
  maxDepth?: number;     // 可选：最大层级深度 (2-6)，默认 4
  maxNodes?: number;     // 可选：最大节点数量 (10-100)，默认 50
}
```

**响应:**
```typescript
interface MindmapApiResponse {
  taskId: string;
  userId: string;
  videoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    nodeCount: number;
    json: MindmapNode;
    markdown: string;
    mermaid: string;
  };
}
```

### 获取思维导图

```
GET /api/prism/knowledge/videos/:videoId/mindmap
```

**响应:**
```typescript
interface GetMindmapApiResponse {
  userId: string;
  videoId: string;
  status: 'PENDING' | 'COMPLETED';
  mindmap: MindmapResult | null;
}
```

### 导出思维导图

```
GET /api/prism/knowledge/videos/:videoId/mindmap/export?format={format}
```

**参数:**
- `format`: 导出格式，支持 `json` | `markdown` | `mermaid` | `xmind` | `freemind`

## 使用方法

### 1. 前端组件使用

```tsx
import { MindmapViewer } from '@/components/prisms/knowledge/MindmapViewer';
import { knowledgeApi } from '@/services/knowledge.api';

function MyComponent() {
  const [mindmap, setMindmap] = useState<MindmapResult | null>(null);

  // 生成思维导图
  const handleGenerate = async () => {
    const response = await knowledgeApi.generateMindmap(videoId, {
      maxDepth: 4,
      maxNodes: 50,
    });
    setMindmap(response.result);
  };

  // 导出思维导图
  const handleExport = async (format: MindmapExportFormat) => {
    const response = await knowledgeApi.exportMindmap(videoId, format);
    // 处理导出内容
    downloadFile(response.content, `mindmap.${format}`);
  };

  return (
    <MindmapViewer
      mindmap={mindmap}
      onGenerate={handleGenerate}
      onExport={handleExport}
      videoId={videoId}
    />
  );
}
```

### 2. 对话窗口触发

在对话窗口中输入 `/mindmap` 命令即可触发思维导图生成：

```
用户: /mindmap 请为这个视频生成一个详细的思维导图
助手: 已收到思维导图指令，正在构建内容结构。
```

系统会自动：
1. 分析当前视频的转写内容
2. 结合关键帧信息
3. 生成结构化思维导图
4. 保存到知识资产中
5. 返回生成结果

### 3. 后端服务直接调用

```typescript
import { MindmapService } from './services/mindmap.service';

@Injectable()
export class MyService {
  constructor(private readonly mindmapService: MindmapService) {}

  async myMethod() {
    const result = await this.mindmapService.generateMindmap({
      userId: 'user-id',
      videoId: 'video-id',
      videoTitle: '视频标题',
      transcriptSegments: [...],
      keyframes: [...],
      maxDepth: 4,
      maxNodes: 50,
    });

    console.log(`生成了 ${result.nodeCount} 个节点`);
    console.log(`Markdown:\n${result.markdown}`);
    console.log(`Mermaid:\n${result.mermaid}`);
  }
}
```

## 数据结构

### MindmapNode

```typescript
interface MindmapNode {
  id: string;
  content: string;
  level: number;
  children?: MindmapNode[];
  metadata?: {
    timestamp?: number;          // 关联的视频时间戳
    keyframeUrl?: string;        // 关联的关键帧图片
    transcriptSegment?: string;   // 关联的转写片段
  };
}
```

### MindmapResult

```typescript
interface MindmapResult {
  json: MindmapNode;      // JSON 格式的树形结构
  markdown: string;       // Markdown 列表格式
  mermaid: string;        // Mermaid 流程图格式
  nodeCount: number;      // 节点总数
}
```

## 实现原理

### 1. AI 生成流程

1. **数据准备**: 收集视频转写内容和关键帧信息
2. **上下文构建**: 整合现有大纲、对话历史等上下文信息
3. **AI 调用**: 通过 AI Router 调用 LLM 生成结构化思维导图
4. **结果解析**: 解析 AI 返回的 JSON，转换为标准格式
5. **多格式转换**: 生成 Markdown、Mermaid 等多种格式
6. **数据持久化**: 保存到知识资产的 `notesMarkdown` 字段

### 2. 降级策略

当 AI 生成失败时，系统会自动降级到规则生成：

1. 按时间段分组转写内容
2. 提取每组的主题词
3. 构建简单的层级结构
4. 关联时间戳和关键帧信息

### 3. 存储方式

思维导图数据存储在 `KnowledgeAsset` 表的 `notesMarkdown` 字段中，以 JSON 字符串形式保存 `MindmapResult` 对象。

## 配置选项

### 生成参数

- `maxDepth`: 控制思维导图的层级深度
  - 最小值: 2（根节点 + 一级子节点）
  - 最大值: 6（避免结构过于复杂）
  - 推荐值: 4（适合大多数视频）

- `maxNodes`: 控制节点总数
  - 最小值: 10（简单结构）
  - 最大值: 100（复杂结构）
  - 推荐值: 50（平衡效果）

### AI 提示词

系统会根据以下信息构建 AI 提示词：
1. 视频标题
2. 转写内容摘要（前 15 段）
3. 关键帧信息（前 8 个）
4. 现有大纲参考（如果有）
5. 用户自定义提示（如果有）

## 扩展开发

### 添加新的导出格式

在 `MindmapService` 中添加新的转换方法：

```typescript
private convertToCustomFormat(node: MindmapNode): string {
  // 实现自定义格式转换
  const lines: string[] = [];
  // ... 转换逻辑
  return lines.join('\n');
}
```

然后在 `exportMindmap` 方法中添加新的 case：

```typescript
case 'custom':
  return this.convertToCustomFormat(mindmap.json);
```

### 自定义视图模式

在前端 `MindmapViewer` 组件中添加新的渲染模式：

1. 在 `ViewMode` 类型中添加新值
2. 在工具栏中添加对应的选项
3. 实现新的渲染函数

## 注意事项

1. **性能考虑**: 生成思维导图是计算密集型操作，建议：
   - 限制转写内容的输入数量
   - 设置合理的节点数量上限
   - 对大视频考虑分批处理

2. **错误处理**: AI 生成可能失败，系统内置了降级策略
   - 确保 AI Router 配置正确
   - 检查用户 API Key 有效性
   - 监控失败率并优化提示词

3. **用户体验**:
   - 提供生成进度反馈
   - 支持取消正在进行的生成
   - 缓存已生成的结果

## 相关文件

### 后端
- `server/src/modules/prism-knowledge/services/mindmap.service.ts` - 核心服务实现
- `server/src/modules/prism-knowledge/knowledge.service.ts` - 知识服务集成
- `server/src/modules/prism-knowledge/knowledge.controller.ts` - API 控制器
- `server/src/modules/prism-knowledge/dto/index.ts` - DTO 定义

### 前端
- `client/src/components/prisms/knowledge/MindmapViewer.tsx` - 可视化组件
- `client/src/components/prisms/knowledge/KnowledgeBoard.tsx` - 知识面板集成
- `client/src/services/knowledge.api.ts` - API 调用封装
- `client/src/types/mindmap.ts` - TypeScript 类型定义

### 对话集成
- `server/src/modules/chat/chat.service.ts` - 对话服务，处理 `/mindmap` 命令
