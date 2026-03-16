FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci --workspaces --include-workspace-root --include=dev

FROM deps AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY server server

RUN npm run prisma:generate --workspace=server \
  && npm run build --workspace=server

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7861

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/generated ./server/generated
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/prisma.config.ts ./server/prisma.config.ts
COPY docker/server-entrypoint.sh ./docker/server-entrypoint.sh

RUN chmod +x ./docker/server-entrypoint.sh

EXPOSE 7861

ENTRYPOINT ["./docker/server-entrypoint.sh"]
