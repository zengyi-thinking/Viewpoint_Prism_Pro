---
# 详细文档见 https://modelscope.cn/docs/创空间卡片
domain:
tags:
  - video-workbench
  - nextjs
  - nestjs
  - prisma
license: Apache License 2.0
---

# Viewpoint Prism Pro

Viewpoint Prism Pro 是一个“视频内容工作台”。同一条视频在一个统一界面中被并行处理为四种资产流：学习、二创、译制、分发。

- `知识棱镜`：视频 -> 结构化知识资产
- `创作棱镜`：视频/文案 -> 节点化可控二创视频
- `译制棱镜`：视频 -> 多语种本地化版本
- `衍射棱镜`：视频 -> 多平台图文分发内容

## 当前魔搭适配方式

本项目原始技术栈为：

- 前端：Next.js
- 后端：NestJS
- 数据层：Prisma
- 实时通信：Socket.IO

魔搭创空间默认提供 Python 入口，因此仓库新增：

- `app.py`：Python 启动器，负责启动前后端并在 `0.0.0.0:7860` 上提供统一代理入口
- `requirements.txt`：Python 侧依赖

内部端口规划：

- 对外入口：`7860`
- 后端内部：`7861`
- 前端内部：`7862`

## 关键环境变量

推荐在创空间中至少配置：

- `HOST=0.0.0.0`
- `PORT=7860`
- `DATABASE_URL`
- `REDIS_URL`
- `MINIO_ENDPOINT`
- `MINIO_PORT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `JWT_SECRET`

在魔搭创空间界面中的设置步骤：

1. 点击右上角 `设置`
2. 点击 `环境变量管理`
3. 点击 `新增`
4. 填写变量名和值后点击 `保存`
5. 返回 `设置` 页面点击 `上线`
6. 在弹窗中点击 `确认`

说明：

- 没有使用到某项 AI 能力时，对应的 `*_KEY` 可以不设置
- 推荐统一使用 `XXX_KEY` 形式
- 更完整的环境变量清单见 [README_MODELSCOPE.md](./README_MODELSCOPE.md)

## API KEY 约定

项目已支持两套命名：

- `XXX_KEY`
- `XXX_API_KEY`

推荐优先使用 `XXX_KEY`，例如：

- `SILICONFLOW_KEY`
- `GEMINI_KEY`
- `OPENAI_KEY`
- `ELEVENLABS_KEY`

## 本地运行

```bash
npm --prefix server run build
npm --prefix client run build
python app.py
```

## 额外说明

如果你的创空间环境没有准备这些基础设施，完整功能仍会受限：

- PostgreSQL
- Redis
- MinIO / S3
- FFmpeg

部署细节见：[README_MODELSCOPE.md](./README_MODELSCOPE.md)
