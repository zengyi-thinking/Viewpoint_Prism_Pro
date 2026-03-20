# Zeabur Service Templates

This folder contains ready-to-copy environment variable templates for deploying this repository to Zeabur as separate services.

## Files

- `client.env.example`: frontend service template with comments
- `server.env.example`: backend service template with comments
- `postgres.env.example`: PostgreSQL service template
- `redis.env.example`: Redis / Valkey service template
- `minio.env.example`: MinIO service template

- `client.env.raw.example`: frontend raw env block for Zeabur
- `server.env.raw.example`: backend raw env block for Zeabur
- `postgres.env.raw.example`: PostgreSQL raw env block for Zeabur
- `redis.env.raw.example`: Redis raw env block for Zeabur
- `minio.env.raw.example`: MinIO raw env block for Zeabur

## Recommended service names

- `client`
- `server`
- `postgres`
- `redis`
- `minio`

## Dockerfiles

- `client` -> `Dockerfile.client`
- `server` -> `Dockerfile.server`

If Zeabur does not auto-detect the Dockerfile by service name, keep:

- `ZBPACK_DOCKERFILE_NAME=client` on the `client` service
- `ZBPACK_DOCKERFILE_NAME=server` on the `server` service

## Important values to replace

- every `change-me`
- `your-frontend-domain.example`
- `your-backend-domain.example`

## Private networking assumptions

These templates assume Zeabur private service hostnames like:

- `postgres`
- `redis`
- `minio`
- `server`
