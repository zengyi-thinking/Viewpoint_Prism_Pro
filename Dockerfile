FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

ENV DEBIAN_FRONTEND=noninteractive
ENV HOST=0.0.0.0
ENV PORT=7860
ENV BACKEND_PORT=7861
ENV FRONTEND_PORT=7862
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /home/user/app

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    ffmpeg \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY . /home/user/app

RUN pip install --no-cache-dir -r requirements.txt
RUN npm ci --workspaces --include-workspace-root
RUN npm --prefix server run prisma:generate
RUN npm --prefix server run build
RUN npm --prefix client run build

ENTRYPOINT ["python", "-u", "app.py"]
