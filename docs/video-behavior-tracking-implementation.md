# 视频行为追踪系统实现说明

## 概述

本次实现为 Viewpoint Prism Pro 项目添加了完整的视频行为追踪系统，涵盖后端 API、数据库模型、前端组件和 Hooks。

## 实现清单

### 后端部分

#### 数据库模型 (Prisma Schema)

已添加以下模型到 `server/prisma/schema.prisma`：

1. **VideoBehaviorEvent** - 记录单个行为事件
   - 事件类型、时间戳、播放状态等
   - 支持不同上下文（知识棱镜、创作棱镜等）

2. **VideoSession** - 观看会话记录
   - 聚合观看数据（总时长、暂停次数、跳转次数等）
   - 观看覆盖率计算
   - 完成状态追踪

3. **VideoBookmark** - 视频书签
   - 支持颜色标签、分类标签
   - 可关联到不同棱镜上下文

4. **VideoNote** - 视频笔记
   - 支持 Markdown 格式
   - 可关联时间范围
   - 可关联知识资产和闪卡

5. **VideoHighlight** - 视频高亮片段
   - 支持分享功能
   - 不同类型的高亮（关键点、引用、场景等）

#### 模块和文件结构

```
server/src/modules/video-behavior/
├── dto/
│   └── index.ts              # 数据传输对象定义
├── video-behavior.module.ts  # 模块定义
├── video-behavior.service.ts # 核心服务逻辑
└── video-behavior.controller.ts # API 控制器
```

#### API 接口

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | /api/video-behavior/track | 追踪单个事件 |
| POST | /api/video-behavior/track/bulk | 批量追踪事件 |
| GET | /api/video-behavior/sessions/active | 获取活跃会话 |
| POST | /api/video-behavior/sessions/end | 结束会话 |
| GET | /api/video-behavior/sessions | 列出所有会话 |
| POST | /api/video-behavior/bookmarks | 创建书签 |
| GET | /api/video-behavior/bookmarks | 列出书签 |
| PUT | /api/video-behavior/bookmarks/:id | 更新书签 |
| DELETE | /api/video-behavior/bookmarks/:id | 删除书签 |
| POST | /api/video-behavior/notes | 创建笔记 |
| GET | /api/video-behavior/notes | 列出笔记 |
| PUT | /api/video-behavior/notes/:id | 更新笔记 |
| DELETE | /api/video-behavior/notes/:id | 删除笔记 |
| POST | /api/video-behavior/highlights | 创建高亮 |
| GET | /api/video-behavior/highlights | 列出高亮 |
| GET | /api/video-behavior/highlights/shared/:token | 获取分享的高亮 |
| PUT | /api/video-behavior/highlights/:id | 更新高亮 |
| DELETE | /api/video-behavior/highlights/:id | 删除高亮 |
| POST | /api/video-behavior/highlights/:id/toggle-share | 切换分享状态 |
| GET | /api/video-behavior/analytics | 获取视频分析 |
| GET | /api/video-behavior/progress | 获取用户进度 |

#### WebSocket 增强

已扩展 `server/src/infrastructure/websocket/ws.gateway.ts`，添加以下事件：

- `video:event` - 实时行为事件
- `video:bookmark` - 书签变更
- `video:note` - 笔记变更
- `video:highlight` - 高亮变更
- `video:session-update` - 会话状态更新

### 前端部分

#### 类型定义 (`client/src/types/video-behavior.ts`)

完整的 TypeScript 类型定义，包括：
- 事件类型枚举
- 上下文类型枚举
- 所有 DTO 和响应接口
- WebSocket 事件接口

#### API 服务 (`client/src/services/video-behavior.api.ts`)

封装所有 API 调用的服务模块，提供：
- 事件追踪方法
- 会话管理方法
- 书签 CRUD 操作
- 笔记 CRUD 操作
- 高亮 CRUD 操作
- 分析和进度获取

#### React Hooks

1. **useVideoBehaviorTracking** - 核心追踪 Hook
   - 自动批量发送事件
   - 会话管理
   - 书签、笔记、高亮操作
   - 文件位置：`client/src/hooks/useVideoBehaviorTracking.ts`

2. **useVideoPlayerWithTracking** - 完整播放器 Hook
   - 集成播放器控制
   - 自动行为追踪
   - 事件处理
   - 文件位置：`client/src/hooks/useVideoPlayerWithTracking.ts`

#### UI 组件

**VideoPlayerWithTracking** - 开箱即用的视频播放器
- 自定义控制条
- 书签、笔记、高亮快捷操作
- 进度显示和统计
- 文件位置：`client/src/components/video/VideoPlayerWithTracking.tsx`

## 使用示例

### 基础使用

```tsx
import { VideoPlayerWithTracking } from '@/components/video/VideoPlayerWithTracking';

<VideoPlayerWithTracking
  videoId="video-123"
  videoUrl="https://example.com/video.mp4"
  context="KNOWLEDGE_PRISM"
/>
```

### 高级使用

```tsx
import { useVideoPlayerWithTracking } from '@/hooks/useVideoPlayerWithTracking';

function MyPlayer() {
  const { videoRef, playerState, controls, bookmarks, createBookmark } =
    useVideoPlayerWithTracking({
      videoId: 'video-123',
      enabled: true,
      onPlay: () => console.log('Playing'),
    });

  return (
    <div>
      <video ref={videoRef} src={videoUrl} />
      <button onClick={controls.play}>Play</button>
      <button onClick={() => createBookmark({
        timestamp: playerState.currentTime,
        title: 'Bookmark'
      })}>
        Add Bookmark
      </button>
    </div>
  );
}
```

## 配置说明

### 环境变量

无需额外环境变量，使用现有配置即可。

### 数据库迁移

在部署前需要运行 Prisma 迁移：

```bash
cd server
npx prisma migrate dev --name add-video-behavior-tracking
```

### 模块注册

`VideoBehaviorModule` 已添加到 `server/src/app.module.ts` 中，无需额外配置。

## 功能特性

### 行为追踪

- 播放、暂停、跳转、倍速、音量等所有播放行为
- 全屏、画中画等界面行为
- 书签、笔记、高亮等用户内容创建行为
- 自动批量发送，减少 API 调用
- 支持离线事件队列

### 会话管理

- 自动创建和管理观看会话
- 计算观看覆盖率和完成状态
- 记录暂停、跳转、缓冲等统计
- 支持多棱镜上下文切换

### 内容管理

- 书签：时间戳标记，支持颜色和标签
- 笔记：时间关联笔记，支持 Markdown
- 高亮：片段高亮，支持分享功能
- 所有内容可跨设备同步

### 数据分析

- 视频观看统计
- 用户行为分析
- 互动数据汇总
- 学习进度追踪

## 扩展建议

1. **实时协作**：通过 WebSocket 实现多用户同时观看
2. **AI 分析**：基于行为数据生成观看报告和建议
3. **个性化推荐**：根据观看历史推荐相关内容
4. **导出功能**：支持导出笔记、书签为各种格式
5. **社交功能**：分享高亮片段、公开笔记等

## 注意事项

1. **性能优化**：事件批量发送间隔建议 5 秒
2. **隐私保护**：用户应能控制是否启用追踪
3. **数据清理**：90 天前的旧数据会自动清理
4. **错误处理**：网络失败时事件会重新入队

## 文档

完整使用文档：`docs/video-behavior-tracking.md`
