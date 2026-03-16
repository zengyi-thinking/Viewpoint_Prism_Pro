#!/bin/sh
set -eu

cd /app/server

echo "Waiting for PostgreSQL schema sync..."
attempt=1
max_attempts=30
until npx prisma db push; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Prisma schema sync failed after $max_attempts attempts."
    exit 1
  fi

  echo "Prisma schema sync failed, retrying in 2s ($attempt/$max_attempts)..."
  attempt=$((attempt + 1))
  sleep 2
done

exec node dist/src/main.js
