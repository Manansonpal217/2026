# Deploying TrackSync Backend to DigitalOcean

**Stack:** DigitalOcean Droplet (Docker) + local PostgreSQL + local Redis (Phase 1) → DO Managed DB (Phase 2) + Cloudflare R2 (screenshots) + Cloudflare DNS/proxy

**Estimated monthly cost:**

- Phase 1 (co-located DB): **~$18/mo** (single 2 vCPU / 2 GB droplet)
- Phase 2 (managed DB + Redis): **~$48/mo** (+$15 Postgres + $15 Redis)

---

## Architecture

```
Internet
  │
  ▼
Cloudflare (DNS + proxy — free TLS, DDoS protection)
  │
  ▼
DigitalOcean Droplet  →  api.tracksync.dev → port 80
  ├── Nginx (reverse proxy: 80 → 127.0.0.1:3001)
  ├── tracksync-backend  (Docker — ghcr.io/manansonpal217/tracksync-backend:production)
  ├── PostgreSQL 16      (Docker — Phase 1; DO Managed Phase 2)
  ├── Redis 7            (Docker — Phase 1; DO Managed Phase 2)
  └── Screenshots  ──→   Cloudflare R2  (presigned PUT from desktop client)
```

---

## Step 1 — Create the Droplet

1. Log in to [cloud.digitalocean.com](https://cloud.digitalocean.com).
2. **Create → Droplet**
   - Image: **Ubuntu 24.04 LTS**
   - Plan: **Basic — 2 vCPU / 2 GB RAM / 60 GB SSD** ($18/mo)
     > 1 GB is insufficient — 10 BullMQ workers run in-process including a Puppeteer/Chromium PDF worker (~400 MB alone).
   - Region: pick closest to your users (`NYC3`, `SFO3`, or `LON1`)
   - Authentication: **SSH key** (add your public key — never use password auth)
   - Hostname: `tracksync-prod`
3. Click **Create Droplet** and note the public IP.

---

## Step 2 — Point Your Domain via Cloudflare

1. Cloudflare Dashboard → `tracksync.dev` → **DNS → Records → Add record**
2. Add:
   - Type: `A`
   - Name: `api` → gives you `api.tracksync.dev`
   - IPv4 address: your Droplet IP
   - Proxy status: **Proxied** (orange cloud) — free TLS + DDoS protection
3. **SSL/TLS → Overview** → set mode to **Flexible**
   (Cloudflare ↔ origin = HTTP on port 80; browser ↔ Cloudflare = HTTPS)

DNS propagation via Cloudflare is near-instant (~30 seconds).

---

## Step 3 — SSH In and Provision the Server

```bash
ssh root@YOUR_DROPLET_IP

# Harden SSH — disable password logins
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall — allow only SSH, HTTP, HTTPS
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Install Docker (official script)
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
apt-get install -y docker-compose-plugin

# Install Nginx
apt-get install -y nginx

# Install Chromium — required for the PDF export BullMQ worker (Puppeteer)
apt-get install -y chromium-browser

# Create app + backup directories
mkdir -p /opt/tracksync /backups

# Verify installs
docker --version && docker compose version && nginx -v && chromium-browser --version
```

---

## Step 4 — Set Up Cloudflare R2 for Screenshots

R2 gives you 10 GB free storage + free egress (AWS S3 charges per GB egress).

1. Cloudflare Dashboard → **R2 Object Storage → Create bucket**
   - Name: `tracksync-screenshots-prod`
   - Location: automatic
2. **R2 → Manage R2 API Tokens → Create API Token**
   - Permissions: `Object Read & Write`
   - Bucket: restrict to `tracksync-screenshots-prod`
   - Save the **Access Key ID** and **Secret Access Key** (shown once only)
3. Note your **Account ID** (top-right of the R2 page or from the URL).
4. Configure **CORS** on the bucket (R2 bucket → Settings → CORS Policy):

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Step 5 — Generate JWT Keys (Run on Your Local Machine)

```bash
# From repo root on your laptop:
pnpm --filter backend run generate-keys
```

Copy both outputs (`JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`). You need them in Step 6.

When pasting multi-line PEM keys into the `.env` file, replace literal newlines with `\n`:

```bash
# Helper: print key as single line for .env
awk 'NF {printf "%s\\n", $0}' your_private_key.pem
```

---

## Step 6 — Create `/opt/tracksync/.env` on the Droplet

```bash
nano /opt/tracksync/.env
```

Paste the block below. Every `REQUIRED_CHANGE` line must be filled before starting:

```env
NODE_ENV=production
PORT=3001
APP_VERSION=0.1.0

# ── Database ─────────────────────────────────────────────────────────────────
# Phase 1 (local Docker Postgres — same droplet):
DATABASE_URL="postgresql://postgres:REQUIRED_CHANGE@postgres:5432/tracksync_prod?connection_limit=10"
# Phase 2 (DO Managed — uncomment and replace Phase 1 line):
# DATABASE_URL="postgresql://doadmin:REQUIRED_CHANGE@your-do-db.db.ondigitalocean.com:25060/tracksync_prod?sslmode=require&connection_limit=10"

# ── Redis ─────────────────────────────────────────────────────────────────────
# Phase 1 (local Docker Redis):
REDIS_URL="redis://redis:6379"
# Phase 2 (DO Managed Redis — uncomment and replace Phase 1 line):
# REDIS_URL="rediss://default:REQUIRED_CHANGE@your-redis-host.db.ondigitalocean.com:25061"

# ── App URL (controls CORS + outbound email links) ────────────────────────────
# Must exactly match your Vercel frontend origin. No trailing slash.
APP_URL="https://app.tracksync.dev"

# ── Cloudflare R2 (screenshots) ───────────────────────────────────────────────
S3_ENDPOINT="https://REQUIRED_CHANGE.r2.cloudflarestorage.com"
# Replace REQUIRED_CHANGE above with your Cloudflare Account ID
AWS_REGION="auto"
AWS_ACCESS_KEY_ID="REQUIRED_CHANGE"
AWS_SECRET_ACCESS_KEY="REQUIRED_CHANGE"
S3_SCREENSHOT_BUCKET="tracksync-screenshots-prod"
S3_FORCE_PATH_STYLE="true"

# ── JWT (RS256 key pair — generated in Step 5) ────────────────────────────────
# Paste as single line with \n between lines (no literal newlines in this file)
JWT_PRIVATE_KEY="REQUIRED_CHANGE"
JWT_PUBLIC_KEY="REQUIRED_CHANGE"

# ── DB Encryption (MFA secrets + integration OAuth tokens) ───────────────────
# Generate: openssl rand -hex 32
# This is REQUIRED in production — server will not accept missing encryption key.
DB_ENCRYPTION_KEY="REQUIRED_CHANGE"

# ── Email — Resend ────────────────────────────────────────────────────────────
RESEND_API_KEY="REQUIRED_CHANGE"
# Optional override (must match a domain verified in Resend):
# RESEND_FROM="TrackSync <support@tracksync.dev>"

# ── Chromium — PDF export BullMQ worker ───────────────────────────────────────
CHROMIUM_PATH=/usr/bin/chromium-browser

# ── Optional: Sentry error tracking ──────────────────────────────────────────
# SENTRY_DSN=https://...@....ingest.sentry.io/...

# ── Optional: Jira / Asana OAuth ─────────────────────────────────────────────
# Leave blank if integrations are not enabled yet.
# JIRA_CLIENT_ID=
# JIRA_CLIENT_SECRET=
# ASANA_CLIENT_ID=
# ASANA_CLIENT_SECRET=
```

---

## Step 7 — Create `/opt/tracksync/docker-compose.yml` on the Droplet

```bash
nano /opt/tracksync/docker-compose.yml
```

```yaml
# Production docker-compose — lives on the droplet at /opt/tracksync/docker-compose.yml
# Phase 1: Postgres + Redis run on the same droplet alongside the API.
# Phase 2: Remove the postgres + redis services and the volumes block when migrating to DO Managed.

services:
  backend:
    image: ghcr.io/manansonpal217/tracksync-backend:production
    restart: unless-stopped
    ports:
      - '127.0.0.1:3001:3001' # bind to localhost only — Nginx proxies externally
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ── Phase 1 only: remove these two services when migrating to DO Managed ──
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tracksync_prod
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: REQUIRED_CHANGE # must match DATABASE_URL in .env
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

> **Note on the `POSTGRES_PASSWORD`:** set it to the same strong password you put in `DATABASE_URL` in `.env`. It only needs to match — it never leaves the droplet.

---

## Step 8 — Configure Nginx as Reverse Proxy

```bash
nano /etc/nginx/sites-available/tracksync
```

```nginx
server {
    listen 80;
    server_name api.tracksync.dev;

    # Cloudflare terminates TLS; traffic arrives here on HTTP port 80.
    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tracksync /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # remove nginx welcome page
nginx -t                                  # test config — must say "ok"
systemctl reload nginx
```

---

## Step 9 — GitHub Actions: Set Up Secrets

In your GitHub repo (`github.com/Manansonpal217/2026`) → **Settings → Environments → `production`**:

Add these secrets:

| Secret name       | Value                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| `DROPLET_IP`      | Your Droplet's public IP address                                                      |
| `DROPLET_SSH_KEY` | Full content of your SSH **private** key (the one whose public key is on the Droplet) |

The `GITHUB_TOKEN` secret is automatic — GitHub provides it for GHCR pushes.

---

## Step 10 — First Deploy

Push to GitHub (or trigger manually via Actions → Deploy → Run workflow → `production`).

The CI workflow will:

1. Build the Docker image from `packages/backend/Dockerfile`
2. Push `ghcr.io/manansonpal217/tracksync-backend:production` to GHCR
3. SSH into the Droplet and run `/opt/tracksync/deploy.sh`

**On the droplet, before the first CI run:**

```bash
# Authenticate with GHCR once (the deploy.sh script does this on subsequent runs)
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u Manansonpal217 --password-stdin
# Create a PAT at: github.com/settings/tokens → classic → read:packages scope only

# Pull and start for the first time
cd /opt/tracksync
docker compose pull
docker compose up -d

# Watch first-start logs — prisma migrate deploy runs automatically
docker compose logs -f backend
```

Expected output:

```
[docker-entrypoint] prisma migrate deploy
...Applying migration `20260308090838_phase_01_auth`
...Applied 27 migrations
Backend running at http://localhost:3001
```

---

## Step 11 — Verify

```bash
# From the droplet (bypasses Nginx + Cloudflare — tests the container directly)
curl http://localhost:3001/health/ready
# → {"status":"ok","db":"ok","redis":"ok","version":"0.1.0"}

# From your browser or laptop (full stack — Cloudflare + Nginx + container)
curl https://api.tracksync.dev/health/ready
```

If Cloudflare DNS hasn't propagated yet, test via IP directly:

```bash
curl -H "Host: api.tracksync.dev" http://YOUR_DROPLET_IP/health/ready
```

---

## Step 12 — Automated Daily Backups

Add a cron job on the droplet to backup Postgres nightly and retain 14 days:

```bash
crontab -e
```

Add this line:

```cron
# Daily Postgres backup at 02:00 — keeps 14 days of gzipped dumps in /backups/
0 2 * * * docker exec tracksync-postgres-1 pg_dump -U postgres tracksync_prod | gzip > /backups/tracksync_$(date +\%Y\%m\%d).sql.gz && find /backups -name "*.sql.gz" -mtime +14 -delete
```

Verify a backup manually:

```bash
docker exec tracksync-postgres-1 pg_dump -U postgres tracksync_prod | gzip > /backups/tracksync_test.sql.gz
ls -lh /backups/
```

---

## Step 13 — Cloudflare Security Settings (5 min)

In Cloudflare Dashboard → `tracksync.dev`:

1. **SSL/TLS → Overview** → Mode: **Flexible** (origin is plain HTTP)
2. **Security → Settings** → Security Level: **Medium**
3. **Speed → Optimization** → Enable Auto Minify (JS, CSS, HTML)
4. **Rules → Page Rules** (optional) → cache `GET /v1/public/*` at edge for 5 min

---

## Maintenance & Operations

### View logs

```bash
docker compose -f /opt/tracksync/docker-compose.yml logs -f backend          # live
docker compose -f /opt/tracksync/docker-compose.yml logs --tail=100 backend  # last 100 lines
```

### Restart backend

```bash
cd /opt/tracksync && docker compose restart backend
```

### Run a new deploy manually

```bash
/opt/tracksync/deploy.sh
```

### Inspect DB with Prisma Studio (from your laptop)

```bash
# SSH port-forward — run on your laptop:
ssh -L 5555:localhost:5555 root@YOUR_DROPLET_IP \
  "cd /opt/tracksync && docker compose exec backend npx prisma studio --port 5555"
# Then open http://localhost:5555
```

### Restore a backup

```bash
# Stop backend first, restore, restart
docker compose -f /opt/tracksync/docker-compose.yml stop backend
gunzip -c /backups/tracksync_20260410.sql.gz | docker exec -i tracksync-postgres-1 psql -U postgres tracksync_prod
docker compose -f /opt/tracksync/docker-compose.yml start backend
```

---

## Phase 2 — Migrate to DO Managed Database (no downtime)

When you have real users and want automatic backups + failover:

### Postgres migration

1. Create DO Managed PostgreSQL (Basic 1 GB = $15/mo) in same region as Droplet.
2. Under **Settings → Trusted Sources** → add your Droplet IP.
3. Dump local DB:
   ```bash
   docker exec tracksync-postgres-1 pg_dump -U postgres tracksync_prod > /backups/migrate_$(date +%Y%m%d).sql
   ```
4. Restore to managed DB:
   ```bash
   psql "postgresql://doadmin:PASS@your-do-db.db.ondigitalocean.com:25060/tracksync_prod?sslmode=require" < /backups/migrate_$(date +%Y%m%d).sql
   ```
5. Update `DATABASE_URL` in `/opt/tracksync/.env`:
   ```env
   DATABASE_URL="postgresql://doadmin:PASS@your-do-db.db.ondigitalocean.com:25060/tracksync_prod?sslmode=require&connection_limit=10"
   ```
6. In `/opt/tracksync/docker-compose.yml`: remove the `postgres` service and `postgres_data` volume.
7. `cd /opt/tracksync && docker compose up -d` — zero downtime.

### Redis migration

1. Create DO Managed Redis (Basic = $15/mo).
2. Update `REDIS_URL` in `.env`:
   ```env
   REDIS_URL="rediss://default:PASS@your-redis-host.db.ondigitalocean.com:25061"
   ```
   > Note: `rediss://` (double-s) = TLS. DO Managed Redis requires TLS.
3. Remove the `redis` service and `redis_data` volume from `docker-compose.yml`.
4. `docker compose up -d`.

---

## Troubleshooting

| Problem                                  | Fix                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `502 Bad Gateway` from Nginx             | Backend not running: `docker compose -f /opt/tracksync/docker-compose.yml ps` + check logs           |
| `{"status":"not_ready","db":"error"}`    | Postgres container not healthy; check `POSTGRES_PASSWORD` matches `DATABASE_URL`                     |
| `{"status":"not_ready","redis":"error"}` | Redis container not healthy; `docker compose ps` to verify                                           |
| JWT error on login                       | `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` not set or has literal `\n` — must be escaped properly          |
| R2 upload fails                          | Check `S3_ENDPOINT` has the correct Cloudflare Account ID; verify API token has R2 write permission  |
| Prisma migration fails on start          | `DATABASE_URL` not reachable from inside the container; for DO Managed add `?sslmode=require`        |
| Cloudflare shows "Error 526"             | Set SSL/TLS mode to **Flexible** (not Full/Strict) — origin uses plain HTTP                          |
| PDF export returns 500                   | `CHROMIUM_PATH` not set or `chromium-browser` not installed; run `which chromium-browser` on droplet |
| `ECONNREFUSED` to Redis                  | Redis container still starting; wait a few seconds and retry                                         |

---

## Summary Checklist

- [ ] Droplet created (Ubuntu 24.04, 2 vCPU / 2 GB, SSH key auth)
- [ ] `ufw` firewall enabled (22, 80, 443 only)
- [ ] Docker + Nginx + `chromium-browser` installed
- [ ] DNS A record `api.tracksync.dev` → Droplet IP (Cloudflare proxied)
- [ ] Cloudflare SSL/TLS mode set to **Flexible**
- [ ] R2 bucket `tracksync-screenshots-prod` created + CORS configured
- [ ] R2 API token saved (Access Key + Secret)
- [ ] JWT key pair generated locally (`pnpm --filter backend run generate-keys`)
- [ ] `DB_ENCRYPTION_KEY` generated (`openssl rand -hex 32`)
- [ ] `/opt/tracksync/.env` filled in (no `REQUIRED_CHANGE` values remaining)
- [ ] `/opt/tracksync/docker-compose.yml` created
- [ ] Nginx site config enabled and reloaded (`nginx -t` passes)
- [ ] GitHub Environment `production` secrets added (`DROPLET_IP`, `DROPLET_SSH_KEY`)
- [ ] GitHub PAT created (read:packages) for GHCR pull on Droplet
- [ ] First `docker compose up -d` succeeded — 27 migrations applied
- [ ] `curl https://api.tracksync.dev/health/ready` returns `{"status":"ok"}`
- [ ] Nightly backup cron installed (`crontab -e`)
- [ ] Automated deploy wired: push to `main` → CI builds image → SSH deploy runs
