# 06 - Chat + 四棱镜 API 契约（统一版）

本文档定义当前后端统一后的接口契约，目标是让前后端并行开发时零歧义对接。

## 通用约定

- 所有接口前缀：`/api`
- 响应格式：由全局拦截器包裹为
  - `{ success: true, data: ..., timestamp: ... }`
- 鉴权：`Authorization: Bearer <token>`
- Prism 路由统一采用：`/api/prism/<prism>/videos/:videoId/...`

## 1. Chat 契约

Base: `/api/chat`

- `POST /sessions`
  - body:
    - `projectId: string` (required)
    - `videoId?: string`
    - `activePrism?: 'knowledge' | 'creation' | 'translation' | 'diffraction'`
- `GET /sessions/:sessionId/messages?limit=50&before=<messageId>`
  - query:
    - `limit?: number` (1-100)
    - `before?: string`
- `POST /sessions/:sessionId/messages`
  - body:
    - `content: string` (required)
    - `videoId?: string`
    - `activePrism?: 'knowledge' | 'creation' | 'translation' | 'diffraction'`
    - `metadata?: Record<string, unknown>`

兼容旧路由（保留）：

- `GET /api/chat/:sessionId/messages`
- `POST /api/chat/:sessionId/messages`

## 2. 知识棱镜 (Knowledge)

Base: `/api/prism/knowledge`

- `POST /videos/:videoId/analyze`
  - body:
    - `regenerateTranscript?: boolean`
    - `regenerateKeyframes?: boolean`
- `GET /videos/:videoId/transcript`
- `GET /videos/:videoId/outline`
- `GET /videos/:videoId/flashcards`
- `POST /videos/:videoId/export`
  - body:
    - `target?: 'markdown' | 'notion' | 'feishu'`

兼容旧路由（保留）：

- `/:videoId/analyze`
- `/:videoId/transcript`
- `/:videoId/outline`
- `/:videoId/flashcards`
- `/:videoId/export`

## 3. 创作棱镜 (Creation)

Base: `/api/prism/creation`

- `GET /videos/:videoId/nodes`
- `POST /videos/:videoId/nodes`
  - body:
    - `orderIndex: number` (required)
    - `prompt?: string`
    - `scriptSegment?: string`
    - `parentNodeId?: string`
    - `positionX?: number`
    - `positionY?: number`
- `POST /videos/:videoId/branches`
  - body:
    - `sourceNodeId: string`
    - `branchName: string`
    - `promptOverride?: string`
- `POST /videos/:videoId/render`
  - body:
    - `nodeId: string`
    - `quality?: 'draft' | 'high'`
    - `stylePresetId?: string`
- `POST /videos/:videoId/stitch`
  - body:
    - `includeNarration?: boolean`
    - `includeBgm?: boolean`

兼容旧路由（保留）：

- `/:videoId/nodes`
- `/:videoId/branches`
- `/:videoId/render`
- `/:videoId/stitch`

## 4. 译制棱镜 (Translation)

Base: `/api/prism/translation`

- `POST /videos/:videoId/tasks`
  - body:
    - `sourceLang?: string`
    - `targetLangs: string[]` (required)
- `GET /videos/:videoId/subtitles`
- `PATCH /videos/:videoId/subtitles`
  - body:
    - `language: string`
    - `segments: Array<Record<string, unknown>>`
- `POST /videos/:videoId/voice-clone`
  - body:
    - `language: string`
    - `voiceSampleUrl?: string`
- `POST /videos/:videoId/lip-sync`
  - body:
    - `language: string`
- `POST /videos/:videoId/export`
  - body:
    - `languages?: string[]`
    - `burnSubtitles?: boolean`

兼容旧路由（保留）：

- `POST /:videoId/translate`
- `GET /:videoId/subtitles`
- `PATCH /:videoId/subtitles`
- `POST /:videoId/voice-clone`
- `POST /:videoId/lip-sync`
- `POST /:videoId/export`

## 5. 衍射棱镜 (Diffraction)

Base: `/api/prism/diffraction`

- `GET /templates`
- `POST /videos/:videoId/generate`
  - body:
    - `platforms: ('xiaohongshu' | 'jike' | 'twitter_x' | 'wechat_mp' | 'newsletter' | 'linkedin' | 'instagram')[]`
    - `tone?: string`
    - `audience?: string`
- `POST /videos/:videoId/export`
  - body:
    - `platforms?: Platform[]`
    - `format?: 'zip' | 'json'`

兼容旧路由（保留）：

- `POST /:videoId/generate`
- `POST /:videoId/batch-export`

