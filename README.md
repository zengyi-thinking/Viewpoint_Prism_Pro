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

当前仓库已经改成 **Docker SDK 创空间可部署版本**。

核心文件：

- `Dockerfile`
- `app.py`

运行方式：

- Docker 镜像内安装 Node.js、Python、ffmpeg
- 构建镜像时完成 Next.js / NestJS 编译
- 容器启动时由 `app.py` 同时拉起前后端，并在 `0.0.0.0:7860` 对外提供统一入口

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

## Docker 部署

面向常规服务器部署时，推荐直接使用 Docker Compose 启动完整服务栈：

```bash
docker compose up -d --build
```

启动后默认入口：

- 前端：http://localhost:7860
- 后端：http://localhost:7861
- 后端健康检查：http://localhost:7861/api/health

当前 Compose 会自动拉起：

- `client`：Next.js 前端
- `server`：NestJS + Prisma 后端
- `postgres`：PostgreSQL 数据库
- `redis`：队列 / 缓存
- `minio`：对象存储

说明：

- `postgres`、`redis`、`minio` 默认仅在 Docker 内部网络开放，不对宿主机映射端口。
- 首次启动时，后端容器会自动执行 `prisma db push` 初始化数据库表结构。
- 如需启用视频转码等依赖系统 `ffmpeg` 的能力，请在服务器镜像环境中额外补装 `ffmpeg`。

## Zeabur 部署

Zeabur 不直接使用当前仓库里的 `docker-compose.yml`，建议拆成两个服务部署：

- 前端服务：使用根目录 `Dockerfile.client`
- 后端服务：使用根目录 `Dockerfile.server`
- 数据库：在 Zeabur 添加 PostgreSQL
- Redis：在 Zeabur 添加 Redis
- 对象存储：建议接入 S3 兼容存储；如果继续使用 MinIO，需要单独部署 MinIO 服务

推荐在 Zeabur 中这样配置：

1. 将 GitHub 仓库导入 Zeabur
2. 新建 `server` 服务，Dockerfile 选择 `Dockerfile.server`
3. 新建 `client` 服务，Dockerfile 选择 `Dockerfile.client`
4. 为 `server` 绑定 PostgreSQL / Redis，并补齐对象存储与 AI 相关环境变量
5. 为 `client` 配置：
   - `INTERNAL_API_URL=http://server:7861`
   - `NEXT_PUBLIC_API_URL=`
   - `NEXT_PUBLIC_WS_URL=` 留空时优先走同源

后端服务至少需要这些环境变量：

- `HOST=0.0.0.0`
- `PORT=7861`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MINIO_ENDPOINT`
- `MINIO_PORT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

说明：

- `Dockerfile.client` 已支持读取平台注入的 `PORT`，避免 Zeabur 动态端口场景下启动失败。
- 如果前端与后端都部署在 Zeabur，浏览器侧建议继续使用同源 `/api`，这样不需要额外处理 CORS 和公网回源地址。

## 额外说明

如果你的创空间环境没有准备这些基础设施，原始完整版功能仍会受限：

- PostgreSQL
- Redis
- MinIO / S3
- FFmpeg

部署细节见：[README_MODELSCOPE.md](./README_MODELSCOPE.md)
