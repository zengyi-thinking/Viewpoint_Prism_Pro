# ModelScope Studio 部署说明

## 当前适配方式

本项目原始技术栈为：

- 前端：Next.js
- 后端：NestJS
- 数据层：Prisma
- 实时通信：Socket.IO

魔搭创空间默认提供的是 Python 入口，因此这里增加了一个 `app.py`：

- `app.py` 会在启动时拉起：
  - Nest 后端（内部端口 `7861`）
  - Next 前端（内部端口 `7862`）
- Python `aiohttp` 反向代理统一对外暴露：
  - `0.0.0.0:7860`

## 关键环境变量

- `HOST=0.0.0.0`
- `PORT=7860`
- `BACKEND_PORT=7861`
- `FRONTEND_PORT=7862`
- `INTERNAL_API_URL=http://127.0.0.1:7861`
- `NEXT_PUBLIC_API_URL=` 建议留空，浏览器走同源代理
- `NEXT_PUBLIC_WS_URL=` 建议留空，WebSocket 走同源代理

## API Key 规范

项目已兼容两套命名：

- `XXX_KEY`
- `XXX_API_KEY`

推荐在创空间中统一使用 `XXX_KEY`，例如：

- `SILICONFLOW_KEY`
- `GEMINI_KEY`
- `OPENAI_KEY`
- `ELEVENLABS_KEY`

## 依赖说明

Python 依赖写在 `requirements.txt` 中：

- `aiohttp`

Node 依赖由 `app.py` 在启动时通过 `npm` 安装和构建。

## 注意

该项目仍然依赖以下外部服务或基础设施：

- PostgreSQL
- Redis
- MinIO / S3
- FFmpeg

如果这些服务在创空间环境中不可用，需要额外配置对应环境变量或云服务地址。
