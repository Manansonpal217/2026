# Build from repository root:
#   docker build -f packages/landing/Dockerfile -t tracksync-landing .
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS builder
ENV CI=true
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/landing ./packages/landing
# Landing may depend on shared workspace packages later; install filtered tree
RUN pnpm install --frozen-lockfile --filter landing...
RUN pnpm --filter landing build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/packages/landing/.next/standalone ./
COPY --from=builder /app/packages/landing/.next/static ./packages/landing/.next/static
# Add `public/` to the landing package if you need static assets; optional COPY can go here.

ENV PORT=3002
ENV HOSTNAME=0.0.0.0
EXPOSE 3002
CMD ["node", "packages/landing/server.js"]
