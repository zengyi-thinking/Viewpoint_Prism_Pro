# 视频行为追踪系统文档

## 概述

视频行为追踪系统用于记录用户观看视频时的所有交互行为，包括播放、暂停、跳转、倍速、书签、笔记、高亮等。这些数据可以用于：

- 分析用户观看行为和偏好
- 提供个性化观看体验
- 生成学习报告和统计
- 跨设备同步观看进度
- 实时协作观看

## 架构设计

### 后端

- **数据库模型**：Prisma Schema 定义了 5 个主要模型
  - `VideoBehaviorEvent`：记录单个行为事件
  - `VideoSession`：记录观看会话及聚合数据
  - `VideoBookmark`：视频书签
  - `VideoNote`：视频笔记
  - `VideoHighlight`：视频高亮片段

- **API 接口**：RESTful API
  - 事件追踪：`POST /api/video-behavior/track`
  - 批量事件：`POST /api/video-behavior/track/bulk`
  - 会话管理：获取、结束会话
  - 书签管理：增删改查
  - 笔记管理：增删改查
  - 高亮管理：增删改查、分享
  - 分析统计：获取视频分析数据、用户进度

- **WebSocket**：实时推送行为事件
  - `video:event`：行为事件
  - `video:bookmark`：书签变更
  - `video:note`：笔记变更
  - `video:highlight`：高亮变更
  - `video:session-update`：会话状态更新

### 前端

- **类型定义**：完整的 TypeScript 类型
- **API 服务**：封装所有 API 调用
- **React Hooks**：
  - `useVideoBehaviorTracking`：行为追踪核心 Hook
  - `useVideoPlayerWithTracking`：集成了播放器控制的 Hook

- **组件**：`VideoPlayerWithTracking` 开箱即用的视频播放器组件

## 使用指南

### 基础用法

#### 1. 使用视频播放器组件

```tsx
import { VideoPlayerWithTracking } from '@/components/video/VideoPlayerWithTracking';
import { VideoActionContext } from '@/types/video-behavior';

function MyVideoPage() {
  return (
    <VideoPlayerWithTracking
      videoId="video-123"
      videoUrl="https://example.com/video.mp4"
      context={VideoActionContext.KNOWLEDGE_PRISM}
      onBookmark={() => console.log('Bookmark created')}
      onNote={() => console.log('Note created')}
      onHighlight={() => console.log('Highlight created')}
    />
  );
}
```

#### 2. 使用行为追踪 Hook

```tsx
import { useVideoBehaviorTracking } from '@/hooks/useVideoBehaviorTracking';
import { VideoActionContext, VideoEventType } from '@/types/video-behavior';

function MyCustomPlayer({ videoId }) {
  const {
    sessionId,
    isTracking,
    trackEvent,
    createBookmark,
    createNote,
    createHighlight,
    bookmarks,
    notes,
  } = useVideoBehaviorTracking({
    videoId,
    enabled: true,
    context: VideoActionContext.NORMAL,
    batchInterval: 5000, // 5秒批量发送
    maxBatchSize: 10,    // 最多缓存10个事件
  });

  const handlePlay = () => {
    trackEvent(VideoEventType.PLAY, { currentTime: 10 });
  };

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      <div>Bookmarks: {bookmarks.length}</div>
    </div>
  );
}
```

#### 3. 使用完整的播放器 Hook

```tsx
import { useVideoPlayerWithTracking } from '@/hooks/useVideoPlayerWithTracking';

function MyVideoPlayer({ videoId, videoUrl }) {
  const {
    videoRef,
    playerState,
    controls,
    bookmarks,
    createBookmark,
  } = useVideoPlayerWithTracking({
    videoId,
    enabled: true,
    onPlay: () => console.log('Playing'),
    onPause: () => console.log('Paused'),
    onSeek: (time) => console.log('Seeked to', time),
  });

  return (
    <div>
      <video ref={videoRef} src={videoUrl} />
      <button onClick={controls.play}>Play</button>
      <button onClick={controls.pause}>Pause</button>
      <button onClick={() => createBookmark({
        timestamp: playerState.currentTime,
        title: 'My Bookmark'
      })}>
        Add Bookmark
      </button>
    </div>
  );
}
```

### API 调用示例

```typescript
import { videoBehaviorApi } from '@/services/video-behavior.api';

// 获取视频分析数据
const analytics = await videoBehaviorApi.getVideoAnalytics('video-123');
console.log('Total sessions:', analytics.totalSessions);
console.log('Average coverage:', analytics.averageCoverage);

// 获取用户进度
const progress = await videoBehaviorApi.getUserVideoProgress('video-123');
console.log('Last position:', progress.lastPosition);
console.log('Completion:', progress.coveragePercent + '%');

// 创建书签
const bookmark = await videoBehaviorApi.createBookmark({
  videoId: 'video-123',
  timestamp: 120,
  title: 'Important moment',
  description: 'This is where the key concept is explained',
  tags: ['important', 'concept'],
});

// 创建笔记
const note = await videoBehaviorApi.createNote({
  videoId: 'video-123',
  timestamp: 120,
  content: '# Key Point\n\nThis is an important concept.',
  isMarkdown: true,
  timeRange: [115, 130],
});

// 创建高亮
const highlight = await videoBehaviorApi.createHighlight({
  videoId: 'video-123',
  startTime: 100,
  endTime: 130,
  title: 'Best Scene',
  description: 'Amazing cinematography',
  highlightType: 'SCENE',
});
```

### WebSocket 事件监听

```typescript
import { useWebSocket } from '@/hooks/use-websocket';

function VideoPage({ videoId }) {
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) return;

    // 监听行为事件
    socket.on('video:event', (data) => {
      console.log('Video event:', data);
    });

    // 监听书签变更
    socket.on('video:bookmark', (data) => {
      if (data.action === 'created') {
        console.log('New bookmark:', data.bookmarkId);
      }
    });

    // 监听会话更新
    socket.on('video:session-update', (data) => {
      if (data.isActive) {
        console.log('User watching at:', data.currentTime);
      }
    });

    return () => {
      socket.off('video:event');
      socket.off('video:bookmark');
      socket.off('video:session-update');
    };
  }, [socket]);

  return <div>...</div>;
}
```

## 行为类型

### 播放行为

- `PLAY`：开始播放
- `PAUSE`：暂停
- `SEEK`：跳转
- `SPEED_CHANGE`：倍速变化
- `VOLUME_CHANGE`：音量变化
- `END`：播放结束
- `BUFFER`：缓冲
- `ERROR`：错误

### 界面行为

- `FULLSCREEN`：全屏切换
- `PICTURE_IN_PICTURE`：画中画

### 内容行为

- `BOOKMARK_ADD`：添加书签
- `BOOKMARK_REMOVE`：删除书签
- `NOTE_ADD`：添加笔记
- `HIGHLIGHT_ADD`：添加高亮
- `REGION_REPEAT`：片段重复
- `REGION_SHARE`：片段分享

### 上下文类型

- `NORMAL`：普通观看
- `KNOWLEDGE_PRISM`：知识棱镜
- `CREATION_PRISM`：创作棱镜
- `TRANSLATION_PRISM`：译制棱镜
- `DIFFRACTION_PRISM`：衍射棱镜

## 数据分析

### 会话指标

- `totalWatchTime`：总观看时长
- `activeWatchTime`：实际播放时长
- `pauseCount`：暂停次数
- `seekCount`：跳转次数
- `bufferCount`：缓冲次数
- `coveragePercent`：观看覆盖率
- `isCompleted`：是否完成

### 互动统计

- 总书签数
- 总笔记数
- 总高亮数
- 互动事件分布

### 用户进度

- 最后观看位置
- 总观看时长
- 覆盖率百分比
- 完成状态

## 最佳实践

1. **批量发送**：启用批量发送以减少 API 调用
2. **会话管理**：正确结束会话以准确计算覆盖率
3. **错误处理**：处理 API 失败情况，考虑重试机制
4. **性能优化**：限制事件队列大小，避免内存问题
5. **隐私保护**：不要追踪敏感信息，提供用户控制选项

## 扩展功能

### 自定义事件

```typescript
trackEvent(VideoEventType.CUSTOM, {
  currentTime: 100,
  metadata: {
    customField: 'value',
    interactionType: 'quiz_answer',
  },
});
```

### 条件追踪

```typescript
const tracking = useVideoBehaviorTracking({
  videoId,
  enabled: userSettings.enableTracking, // 用户可控制
  context: currentPrism,
});
```

### 数据导出

可以扩展 API 以支持导出用户行为数据：

```typescript
// 导出 CSV
export const exportBehaviorData = (videoId: string, format: 'csv' | 'json') => {
  return apiFetch(`/api/video-behavior/export?videoId=${videoId}&format=${format}`);
};
```

## 维护

- 数据库自动清理：90天前的事件数据会自动删除
- 会话超时：1小时无活动会话自动结束
- 定期分析：建议定期生成分析报告
