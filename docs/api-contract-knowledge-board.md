# Knowledge Board API 契约（冻结版）

本文档用于冻结知识棱镜在阶段 A/B 的输入输出契约，保障前后端并行开发不返工。

## 1. 状态机

`idle -> analyzing -> streaming -> ready -> syncing -> synced / failed`

- `idle`：未开始分析，无有效产物
- `analyzing`：分析任务已启动，正在执行 ASR/关键帧等步骤
- `streaming`：已产生增量结果，持续向时间轴推送
- `ready`：分析完成，可用于问答/导出
- `syncing`：同步 Notion/飞书中
- `synced`：至少一个外部同步目标完成
- `failed`：分析或同步失败

## 2. Timeline 统一数据结构

Timeline item `type` 仅允许以下枚举：

- `KEYFRAME_CARD`
- `OUTLINE_BLOCK`
- `QA_CARD`
- `FLASHCARD`
- `REVIEW_PLAN`

统一字段：

```json
{
  "id": "string",
  "type": "KEYFRAME_CARD | OUTLINE_BLOCK | QA_CARD | FLASHCARD | REVIEW_PLAN",
  "videoId": "string",
  "assetId": "string | null",
  "timestampSec": 12.5,
  "title": "string",
  "summary": "string",
  "content": "string",
  "imageUrl": "string",
  "metadata": {},
  "createdAt": "ISO-8601"
}
```

## 3. REST 接口

Base: `/api/prism/knowledge`

### 3.1 启动分析

`POST /videos/:videoId/analyze`

Request:

```json
{
  "regenerateTranscript": false,
  "regenerateKeyframes": false
}
```

Response (核心字段):

```json
{
  "taskId": "knowledge_xxx",
  "videoId": "xxx",
  "status": "completed",
  "boardState": "ready",
  "transcriptId": "xxx",
  "keyframeCount": 6,
  "assetId": "xxx",
  "flashcardCount": 12
}
```

### 3.2 获取看板快照

`GET /videos/:videoId/board`

Response:

```json
{
  "videoId": "xxx",
  "projectId": "xxx",
  "state": "streaming",
  "timeline": [],
  "stats": {
    "transcriptSegments": 20,
    "keyframes": 5,
    "flashcards": 10,
    "qaCards": 2,
    "outlineBlocks": 8
  },
  "updatedAt": "ISO-8601"
}
```

### 3.3 一键结算（阶段 E）

`POST /videos/:videoId/settle`

Request:

```json
{
  "syncTargets": ["notion", "feishu"],
  "forceRegenerate": false
}
```

Response（核心字段）：

```json
{
  "taskId": "knowledge_settle_xxx",
  "status": "completed",
  "boardState": "ready | synced",
  "output": {
    "title": "xxx - 学习结算包",
    "outlineMarkdown": "...",
    "notesMarkdown": "...",
    "reviewPlanMarkdown": "...",
    "markdownPackage": {
      "fileName": "xxx-knowledge-settlement.md",
      "content": "...",
      "size": 12345
    },
    "flashcards": [],
    "keyframes": []
  },
  "sync": {
    "notion": { "success": true, "mode": "api | dry-run", "url": "..." },
    "feishu": { "success": true, "mode": "api | dry-run", "url": "..." }
  },
  "syncedTargets": ["notion", "feishu"]
}
```

### 3.4 导出/同步（阶段 F）

`POST /videos/:videoId/export`

- `target=markdown`：只做结算产物生成。
- `target=notion|feishu`：自动包含对应同步目标。
- 返回结构与 `/settle` 一致。

## 4. WebSocket 增量事件

Namespace: `/ws`，并已 `join:project`。

### 4.1 看板状态事件

Event: `knowledge:state`

```json
{
  "projectId": "xxx",
  "videoId": "xxx",
  "taskId": "knowledge_xxx",
  "state": "analyzing | streaming | ready | syncing | synced | failed",
  "message": "string",
  "stats": {},
  "timestamp": "ISO-8601"
}
```

### 4.2 时间轴增量事件

Event: `knowledge:timeline`

```json
{
  "projectId": "xxx",
  "videoId": "xxx",
  "taskId": "knowledge_xxx",
  "item": {
    "id": "string",
    "type": "KEYFRAME_CARD",
    "title": "关键帧 1",
    "timestampSec": 8,
    "imageUrl": "https://...",
    "createdAt": "ISO-8601"
  },
  "timestamp": "ISO-8601"
}
```
