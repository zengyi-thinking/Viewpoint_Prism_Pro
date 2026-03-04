# 衍射棱镜（Diffraction Prism）实现报告

## 概述

衍射棱镜已完成所有核心功能的实现，包括关键帧提取、AI 质量分析、平台文案生成、批量导出和草稿管理。

---

## 实现的功能

### 1. 关键帧提取（ImageSelectService）

- 使用 FFmpeg 从视频中均匀提取关键帧
- 使用 AI（MULTIMODAL）分析每帧的构图质量、数据图表、讲者表情等
- 按质量评分排序，返回最优的 6 帧

**文件**: `server/src/modules/prism-diffraction/services/image-select.service.ts`

### 2. 平台文案生成（CopywritingService）

支持 5 个平台，每个平台有特定的 Prompt 模板和格式要求：

| 平台 | 分辨率 | 特点 |
|------|--------|------|
| xiaohongshu | 1080x1920 | 种草感、焦虑感、Emoji |
| twitter_x | 1200x900 | Thread 悬念、干货 |
| newsletter | 1200x800 | 深度长文、结构化 |
| linkedin | 1200x627 | 专业洞见、数据驱动 |
| instagram | 1080x1080 | 精美学感、Hashtag |

**文件**: `server/src/modules/prism-diffraction/services/copywriting.service.ts`

### 3. 批量导出（BatchExportService）

- 支持多平台批量导出
- 按平台要求自动调整图片分辨率
- 生成 JSON 数据文件并上传到存储

**文件**: `server/src/modules/prism-diffraction/services/batch-export.service.ts`

### 4. 草稿管理

- 获取草稿列表
- 删除草稿（带权限验证）

**文件**: `server/src/modules/prism-diffraction/diffraction.service.ts`

---

## API 端点

| 方法 | 端点 | 功能 |
|------|--------|------|
| GET | `/api/prism/diffraction/templates` | 获取平台模板列表 |
| POST | `/api/prism/diffraction/keyframes` | 提取关键帧 |
| POST | `/api/prism/diffraction/copywriting` | 生成平台文案 |
| POST | `/api/prism/diffraction/export` | 批量导出 |
| GET | `/api/prism/diffraction/drafts/:videoId` | 获取草稿列表 |
| DELETE | `/api/prism/diffraction/drafts/:draftId` | 删除草稿 |

---

## 修复的问题

| 问题 | 描述 | 修复 |
|------|------|------|
| TypeScript 编译错误 | `diffractionId` 字段不存在于 `DiffractionTask` 模型 | 改为使用正确的 `videoId` |
| Controller 重复路由 | `@Post('videos/:videoId/generate')` 和 `@Post(':videoId/generate')` 重复 | 删除重复装饰器 |
| videoId 类型不匹配 | controller 传递 VideoSource ID，service 期望 DiffractionTask ID | 修正传递正确的 ID 类型 |
| 图片处理错误 | 直接使用 URL 作为本地路径 | 先从 URL 下载图片到临时目录，再处理 |
| 权限验证缺失 | 删除草稿时未验证 userId | 添加 userId 验证 |

---

## 数据库模型

```prisma
model DiffractionTask {
  id      String      @id @default(cuid())
  videoId String
  video   VideoSource @relation(fields: [videoId], references: [id], onDelete: Cascade)
  userId  String
  status  TaskStatus  @default(PENDING)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  platformDrafts PlatformDraft[]

  @@index([videoId])
  @@index([userId])
  @@map("diffraction_tasks")
}

model PlatformDraft {
  id            String          @id @default(cuid())
  diffractionId String
  diffraction   DiffractionTask @relation(fields: [diffractionId], references: [id], onDelete: Cascade)

  platform      Platform
  title         String?
  content       String   @db.Text
  hookLine      String?
  ctaLine       String?
  tone          String?
  emojiStrategy String?
  selectedImages Json?

  version     Int     @default(1)
  isPublished Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([diffractionId, platform])
  @@map("platform_drafts")
}
```

---

## AI 调用映射

| 功能 | AITaskType | Provider |
|------|------------|----------|
| 关键帧质量分析 | MULTIMODAL | Seedance |
| 平台文案生成 | LLM_CHAT | Seedance |

---

## 测试脚本

已创建测试脚本：`server/test-diffraction.ts`

使用方法：
1. 修改 `AUTH_TOKEN` 为有效的 JWT token
2. 修改 `VIDEO_ID` 为有效的视频 ID
3. 运行：`npm run ts-node test-diffraction.ts`

---

## 状态总结

| 项目 | 状态 |
|------|------|
| TypeScript 编译 | ✅ 通过 |
| 核心功能实现 | ✅ 完成 |
| API 端点 | ✅ 完整 |
| AI 集成 | ✅ 正确 |
| 数据库模型 | ✅ 正确 |
| 测试脚本 | ✅ 已创建 |

---

**衍射棱镜已完全就绪，可以进行端到端工作流测试。**
