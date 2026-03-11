FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

ENV DEBIAN_FRONTEND=noninteractive
ENV HOST=0.0.0.0
ENV PORT=7860
ENV BACKEND_PORT=7861
ENV FRONTEND_PORT=7862
ENV NEXT_TELEMETRY_DISABLED=1
ENV POSTGRES_HOST=127.0.0.1
ENV POSTGRES_PORT=5433
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_DB=viewpoint_prism
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/viewpoint_prism
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379
ENV REDIS_URL=redis://127.0.0.1:6379
ENV MINIO_HOST=127.0.0.1
ENV MINIO_PORT=9000
ENV MINIO_CONSOLE_PORT=9001
ENV MINIO_ENDPOINT=127.0.0.1
ENV MINIO_ACCESS_KEY=minioadmin
ENV MINIO_SECRET_KEY=minioadmin
ENV MINIO_BUCKET=viewpoint-prism
ENV MINIO_USE_SSL=false
ENV FFMPEG_PATH=ffmpeg
ENV AUTO_PRISMA_PUSH=1
ENV ALLOW_START_WITHOUT_DB=0

WORKDIR /home/user/app

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    ffmpeg \
    gnupg \
    postgresql \
    redis-server \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y nodejs \
    && curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio \
    && chmod +x /usr/local/bin/minio \
    && mkdir -p /home/user/data/postgres /home/user/data/redis /home/user/data/minio \
    && rm -rf /var/lib/apt/lists/*

COPY . /home/user/app

RUN pip install --no-cache-dir -r requirements.txt
RUN npm config set registry https://registry.npmmirror.com/ \
    && npm config set replace-registry-host always \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --workspaces --include-workspace-root --include=dev
RUN npm run db:generate
RUN npm run build:server
RUN npm run build:client

ENV NODE_ENV=production

ENTRYPOINT ["python", "-u", "app.py"]
