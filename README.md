# Viewpoint Prism Pro

Viewpoint Prism Pro 是一个“视频内容工作台”。同一条视频在一个统一界面中被并行处理为四种资产流：学习、二创、译制、分发。

- `知识棱镜`：视频 -> 结构化知识资产
- `创作棱镜`：视频/文案 -> 节点化可控二创视频
- `译制棱镜`：视频 -> 多语种本地化版本
- `衍射棱镜`：视频 -> 多平台图文分发内容

## 技术栈

- 前端：Next.js
- 后端：NestJS
- 数据层：Prisma
- 实时通信：Socket.IO
- 队列：Redis / Bull
- 对象存储：MinIO / S3 兼容接口
- 视频处理：FFmpeg

## API Key 约定

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
npm run dev:server
npm run dev:client
```

默认访问地址：

- 前端：http://localhost:7870
- 后端：http://localhost:7871

如果需要完整基础设施：

```bash
docker compose up -d postgres redis minio
```

## Docker 部署

面向常规服务器部署时，推荐直接使用 Docker Compose 启动完整服务栈：

```bash
docker compose up -d --build
```

启动后默认入口：

- 前端：http://localhost:7870
- 后端：http://localhost:7871
- 后端健康检查：http://localhost:7871/api/health

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
   - `INTERNAL_API_URL=http://server:7871`
   - `NEXT_PUBLIC_API_URL=`
   - `NEXT_PUBLIC_WS_URL=https://你的后端公网域名`

后端服务至少需要这些环境变量：

- `HOST=0.0.0.0`
- `PORT=7871`
- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`
- `BYOK_ENCRYPTION_KEY`
- `MINIO_ENDPOINT`
- `MINIO_PORT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

说明：

- `Dockerfile.client` 已支持读取平台注入的 `PORT`，当前默认前端端口为 `7870`，便于与本地环境保持一致。
- HTTP API 可以通过 Next rewrite 走同源 `/api`。
- WebSocket 不走 Next rewrite，建议给后端单独分配一个公网域名并配置到 `NEXT_PUBLIC_WS_URL`。

## 基础环境变量

可从 [`.env.example`](/d:/DevProject/Viewpoint_Prism_Pro/.env.example) 复制并按环境裁剪。核心变量如下：

- PostgreSQL
  - `DATABASE_URL`
- Redis
  - `REDIS_HOST`
  - `REDIS_PORT`
  - `REDIS_URL`
- MinIO / S3
  - `MINIO_ENDPOINT`
  - `MINIO_PORT`
  - `MINIO_ACCESS_KEY`
  - `MINIO_SECRET_KEY`
  - `MINIO_BUCKET`
  - `MINIO_USE_SSL`
- FFmpeg
  - `FFMPEG_PATH`
- Auth
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
  - `BYOK_ENCRYPTION_KEY`
