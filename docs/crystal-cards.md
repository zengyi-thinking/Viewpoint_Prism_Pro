# 晶体卡片功能说明

## 概述

晶体卡片是 Viewpoint Prism Pro 知识棱镜的核心功能之一，它将视频内容自动转换为结构化的学习卡片，帮助用户高效学习和记忆。

## 功能特性

### 卡片类型

1. **概念卡片 (CONCEPT)** - 提取视频中的核心概念和定义
2. **时间线卡片 (TIMELINE)** - 按时间顺序组织关键内容
3. **关键帧卡片 (KEYFRAME)** - 基于视觉内容的卡片
4. **洞察卡片 (INSIGHT)** - 深度分析和关联内容
5. **摘要卡片 (SUMMARY)** - 整体概览和总结

### 卡片属性

- **难度等级** - 1-5级，用进度条显示
- **重要性** - 1-5星，用星星图标显示
- **时间戳** - 支持跳转到视频特定时间点
- **标签系统** - 支持自定义标签分类
- **精选标记** - 高亮重要卡片
- **验证状态** - 标记已验证的内容

## 使用方法

### 生成晶体卡片

```typescript
import { knowledgeApi } from '@/services/knowledge.api';

// 生成晶体卡片
const result = await knowledgeApi.regenerateCrystalCards(videoId, {
  types: [
    CrystalCardType.CONCEPT,
    CrystalCardType.TIMELINE,
    CrystalCardType.INSIGHT,
    CrystalCardType.SUMMARY,
  ],
  maxCards: 12,
  includeKeyframes: true,
  difficulty: 2,
});
```

### 查看晶体卡片

```typescript
import { CrystalCardViewer } from '@/components/prisms/knowledge';

<CystalCardViewer
  videoId={videoId}
  onTimeClick={(timestamp) => {
    // 跳转到视频指定时间点
    player.seekTo(timestamp);
  }}
/>
```

### 获取卡片列表

```typescript
// 获取所有卡片
const response = await knowledgeApi.getCrystalCards(videoId);

// 按类型筛选
const conceptCards = await knowledgeApi.getCrystalCards(videoId, 'CONCEPT');

// 获取精选卡片
const featured = await knowledgeApi.getFeaturedCrystalCards(videoId);
```

### 更新卡片

```typescript
await knowledgeApi.updateCrystalCard(cardId, {
  title: '新标题',
  content: '新内容',
  importance: 5,
  isFeatured: true,
});
```

### 删除卡片

```typescript
await knowledgeApi.deleteCrystalCard(cardId);
```

## 组件属性

### CrystalCardViewer

| 属性 | 类型 | 说明 |
|------|------|------|
| videoId | string | 视频 ID |
| onTimeClick | (timestamp: number) => void | 时间戳点击回调 |
| className | string | 自定义样式类名 |

### CrystalCard (类型)

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | 卡片 ID |
| assetId | string | 知识资产 ID |
| type | CrystalCardType | 卡片类型 |
| title | string | 标题 |
| content | string | 完整内容 |
| summary | string \| undefined | 摘要 |
| timestamp | number \| undefined | 视频时间戳（秒） |
| videoTime | string \| undefined | 格式化的时间字符串 |
| imageUrl | string \| undefined | 关键帧图片 URL |
| tags | string[] | 标签数组 |
| difficulty | number | 难度等级 (1-5) |
| importance | number | 重要性 (1-5) |
| isFeatured | boolean | 是否精选 |
| isVerified | boolean | 是否已验证 |
| orderIndex | number | 排序索引 |
| category | string \| undefined | 分类 |

## 数据流程

1. **视频转写** - 使用 Whisper 等服务生成字幕
2. **关键帧提取** - 提取视频中的关键画面
3. **卡片生成** - CrystalCardService 分析内容并生成卡片
4. **用户交互** - 查看、筛选、编辑卡片
5. **时间跳转** - 点击时间戳跳转到视频对应位置

## API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/prism/knowledge/videos/:videoId/crystal-cards` | 获取卡片列表 |
| GET | `/api/prism/knowledge/videos/:videoId/crystal-cards/featured` | 获取精选卡片 |
| GET | `/api/prism/knowledge/crystal-cards/:cardId` | 获取单张卡片 |
| PATCH | `/api/prism/knowledge/crystal-cards/:cardId` | 更新卡片 |
| DELETE | `/api/prism/knowledge/crystal-cards/:cardId` | 删除卡片 |
| POST | `/api/prism/knowledge/videos/:videoId/crystal-cards/regenerate` | 重新生成卡片 |

## 样式主题

组件使用 CSS 变量适配不同主题：

- `--bg-primary` - 主背景色
- `--bg-panel` - 面板背景色
- `--bg-panel-secondary` - 次级面板背景色
- `--border` - 边框颜色
- `--border-subtle` - 次级边框颜色
- `--border-focus` - 聚焦边框颜色
- `--text-primary` - 主文本颜色
- `--text-secondary` - 次级文本颜色
- `--accent-primary` - 主题色
- `--accent-hover` - 悬停主题色
- `--color-success` - 成功颜色

## 未来扩展

- [ ] AI 驱动的卡片推荐
- [ ] 卡片之间的关联链接
- [ ] 导出为 Anki 格式
- [ ] 协作编辑和分享
- [ ] 学习进度追踪
- [ ] 自定义卡片模板
