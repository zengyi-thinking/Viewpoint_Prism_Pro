# Zeabur Dual-Service Deployment

This project should be deployed to Zeabur as separate `client` and `server` services from the same GitHub repository.

## Required services

Create these services inside one Zeabur project:

1. `client`
2. `server`
3. `postgres`
4. `redis`
5. `minio` or another S3-compatible object storage

## Service names and Dockerfiles

Zeabur supports selecting a Dockerfile by service name. This repository is already prepared for that:

- `client` uses `Dockerfile.client`
- `server` uses `Dockerfile.server`

If Zeabur does not auto-detect the correct Dockerfile, set:

- `ZBPACK_DOCKERFILE_NAME=client` on the `client` service
- `ZBPACK_DOCKERFILE_NAME=server` on the `server` service

## Client service

Recommended settings:

- Service name: `client`
- Dockerfile: `Dockerfile.client`
- Port: `7870`
- Domain: public domain enabled

Environment variables template:

- see `zeabur/client.env.example`
- raw block: `zeabur/client.env.raw.example`

Important notes:

- `INTERNAL_API_URL` should point to the private server hostname, usually `http://server:7871`
- leave `NEXT_PUBLIC_API_URL` empty so HTTP requests use Next.js rewrite
- set `NEXT_PUBLIC_WS_URL` to the public backend domain because WebSocket traffic does not use rewrite

## Server service

Recommended settings:

- Service name: `server`
- Dockerfile: `Dockerfile.server`
- Port: `7871`
- Domain: public domain enabled

Environment variables template:

- see `zeabur/server.env.example`
- raw block: `zeabur/server.env.raw.example`

Important notes:

- `DATABASE_URL` should use the Zeabur Postgres private hostname
- `REDIS_URL` should use the Zeabur Redis private hostname and password
- object storage credentials must match the actual MinIO or S3 service
- the server can read `REDIS_URL`, `REDIS_CONNECTION_STRING`, `REDIS_URI`, and also split `REDIS_HOST` / `REDIS_PORT` / `REDIS_USERNAME` / `REDIS_PASSWORD`
- the server can read either `MINIO_*` or compatible `S3_*` / `AWS_*` credentials

## Why not Docker Compose

Zeabur does not deploy directly from `docker-compose.yml`. The Compose file in this repository is for local development only.

## Infrastructure service templates

Use these files as copy sources when creating infrastructure services:

- Postgres: `zeabur/postgres.env.example` or `zeabur/postgres.env.raw.example`
- Redis: `zeabur/redis.env.example` or `zeabur/redis.env.raw.example`
- MinIO: `zeabur/minio.env.example` or `zeabur/minio.env.raw.example`

## Post-deploy checks

After both services are online:

1. Open the frontend domain and confirm the app loads
2. Open browser devtools and verify `/api/...` requests return 200
3. Verify WebSocket connects to `NEXT_PUBLIC_WS_URL`
4. Upload a local video and confirm playback works
5. Drag the progress bar and verify the video request returns `206 Partial Content`
