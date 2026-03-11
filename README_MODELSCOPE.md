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

## 在魔搭创空间中设置环境变量

请在仓库页面右上角进入环境变量管理界面，并按下面步骤操作：

1. 点击右上角 `设置`
2. 点击 `环境变量管理`
3. 点击 `新增`
4. 输入变量名和值
5. 点击 `保存`
6. 变量保存完成后，回到右上角 `设置`
7. 点击 `上线`
8. 在弹窗中点击 `确认`

说明：

- 如果某项 AI 能力没有使用，对应的 `*_KEY` 可以不设置
- 如果修改了环境变量，通常需要重新 `上线` 才会生效
- 推荐统一使用 `XXX_KEY` 形式，不必同时填写 `XXX_API_KEY`

## 环境变量清单

### 一、基础必填

这些变量建议优先配置，否则应用很难完整运行：

- `HOST=0.0.0.0`
- `PORT=7860`
- `BACKEND_PORT=7861`
- `FRONTEND_PORT=7862`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `BYOK_ENCRYPTION_KEY`

建议值示例：

- `HOST=0.0.0.0`
- `PORT=7860`
- `BACKEND_PORT=7861`
- `FRONTEND_PORT=7862`
- `NEXTAUTH_URL=https://你的创空间域名`

### 二、前后端代理相关

- `INTERNAL_API_URL=http://127.0.0.1:7861`
- `NEXT_PUBLIC_API_URL=` 建议留空，浏览器走同源代理
- `NEXT_PUBLIC_WS_URL=` 建议留空，WebSocket 走同源代理

### 三、对象存储 / 文件能力

如果需要上传视频、生成缩略图、播放视频，建议配置：

- `MINIO_ENDPOINT`
- `MINIO_PORT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `FFMPEG_PATH`

### 四、AI 服务 KEY

只有在你要使用对应 AI 能力时，才需要设置对应 KEY。

## API Key 规范

项目已兼容两套命名：

- `XXX_KEY`
- `XXX_API_KEY`

推荐在创空间中统一使用 `XXX_KEY`，例如：

- `SILICONFLOW_KEY`
- `GEMINI_KEY`
- `OPENAI_KEY`
- `ELEVENLABS_KEY`

常见可选项如下：

#### 1. 推荐默认：硅基流动

- `SILICONFLOW_KEY`
- `SILICONFLOW_API_KEYS`（多 Key 轮换池，可选）
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL_LLM`
- `SILICONFLOW_MODEL_VLM`
- `SILICONFLOW_MODEL_ASR`
- `SILICONFLOW_MODEL_IMAGE`
- `SILICONFLOW_MODEL_VIDEO`
- `SILICONFLOW_MODEL_TTS`

#### 2. Gemini / Google

- `GEMINI_KEY`
- `GOOGLE_KEY`
- `GEMINI_BASE_URL`
- `GEMINI_MODEL_CHAT`
- `GEMINI_MODEL_VISION`
- `GEMINI_MODEL_IMAGE`
- `GEMINI_MODEL_VIDEO`
- `GEMINI_MODEL_TTS`

#### 3. OpenAI 兼容 / 官方

- `OPENAI_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_PREMIUM_KEY`
- `OPENAI_PREMIUM_BASE_URL`

#### 4. 语音 / 图像 / 视频扩展

- `ELEVENLABS_KEY`
- `MIDJOURNEY_KEY`
- `SEEDANCE_KEY`
- `RUNWAY_KEY`
- `PIKA_KEY`
- `DEEPL_KEY`

### 五、外部同步能力（按需）

如果你会把知识内容同步到第三方平台，再配置这些变量：

- `NOTION_INTEGRATION_TOKEN`
- `NOTION_PARENT_PAGE_ID`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_FOLDER_TOKEN`

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
