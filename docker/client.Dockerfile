FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci --workspaces --include-workspace-root --include=dev \
  && mkdir -p /app/client \
  && ln -s /app/node_modules /app/client/node_modules

FROM deps AS builder

WORKDIR /app

ARG INTERNAL_API_URL=http://server:7871
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_WS_URL=http://localhost:7871

ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json package-lock.json ./
COPY client client

RUN npm run build --workspace=client

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=7870
ENV HOSTNAME=0.0.0.0

WORKDIR /app/client

COPY --from=deps /app/client/node_modules ./node_modules
COPY --from=builder /app/client/.next ./.next
COPY --from=builder /app/client/public ./public
COPY --from=builder /app/client/package.json ./package.json
COPY --from=builder /app/client/next.config.ts ./next.config.ts

EXPOSE 7870

CMD ["sh", "-c", "node /app/node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port ${PORT:-7870}"]
