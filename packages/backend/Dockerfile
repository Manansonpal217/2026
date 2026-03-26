# Build from repository root:
#   docker build -f packages/backend/Dockerfile -t tracksync-backend .
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
ENV CI=true
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend ./packages/backend
RUN pnpm install --frozen-lockfile --filter backend...
RUN pnpm --filter backend exec prisma generate
RUN pnpm --filter backend build

FROM base AS runner
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend
EXPOSE 3001
# Run DB migrations in CI/CD before starting, or use a migration init container.
CMD ["node", "dist/main.js"]
