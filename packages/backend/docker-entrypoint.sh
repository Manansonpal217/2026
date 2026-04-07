#!/bin/sh
set -e
cd /app/packages/backend

if [ "${SKIP_PRISMA_MIGRATE:-}" != "1" ]; then
  echo "[docker-entrypoint] prisma migrate deploy"
  pnpm exec prisma migrate deploy
fi

exec "$@"
