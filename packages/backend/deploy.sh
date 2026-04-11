#!/usr/bin/env bash
# /opt/tracksync/deploy.sh
# Run on the DigitalOcean droplet — called by GitHub Actions (appleboy/ssh-action) on production deploys.
# Also safe to run manually: bash /opt/tracksync/deploy.sh
#
# Required env vars (set in the CI environment or export before running manually):
#   GITHUB_PAT   — GitHub personal access token with read:packages scope
#                  Create at: github.com/settings/tokens → classic → read:packages
#
# The script:
#   1. Authenticates with GHCR using GITHUB_PAT (never hardcoded)
#   2. Pulls the latest production image
#   3. Restarts the backend container without touching Postgres or Redis
#   4. Prunes dangling images to free disk space

set -euo pipefail

APP_DIR="/opt/tracksync"
GHCR_IMAGE="ghcr.io/manansonpal217/tracksync-backend:production"
GITHUB_USER="Manansonpal217"

echo "[deploy] Starting deploy at $(date)"

# ── 1. Authenticate with GHCR ────────────────────────────────────────────────
if [ -z "${GITHUB_PAT:-}" ]; then
  echo "[deploy] ERROR: GITHUB_PAT environment variable is not set."
  echo "         Export it before running: export GITHUB_PAT=ghp_..."
  exit 1
fi

echo "${GITHUB_PAT}" | docker login ghcr.io -u "${GITHUB_USER}" --password-stdin
echo "[deploy] Logged in to ghcr.io"

# ── 2. Pull latest production image ──────────────────────────────────────────
cd "${APP_DIR}"
docker compose pull backend
echo "[deploy] Pulled ${GHCR_IMAGE}"

# ── 3. Restart backend only (Postgres + Redis left running) ──────────────────
docker compose up -d --no-deps backend
echo "[deploy] Backend container restarted"

# ── 4. Clean up dangling images ───────────────────────────────────────────────
docker image prune -f
echo "[deploy] Pruned unused images"

echo "[deploy] Done at $(date)"
