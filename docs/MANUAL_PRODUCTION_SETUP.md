# Manual production setup (step-by-step)

This guide lists **everything you do outside the repo** to go live: cloud accounts, secrets, DNS, deploy hooks, and optional monitoring. For day‑2 operations (rollback, scaling triggers), see [RUNBOOK.md](../RUNBOOK.md).

**Accounts to have ready**

- Domain registrar or **Cloudflare** (DNS + TLS + optional R2).
- **DigitalOcean** (or another VPS + managed Postgres + managed Redis).
- **Vercel** (recommended for `packages/landing`) _or_ your own container host for the landing image.
- **GitHub** (source + Actions + Releases for desktop builds).
- Optional: **Sentry**, **UptimeRobot** (or similar), SMTP provider for real email.

---

## 0. Decide hostnames

Pick stable URLs before creating services (example names — use yours):

| Purpose           | Example                      |
| ----------------- | ---------------------------- |
| Landing (Next.js) | `https://app.yourdomain.com` |
| API (Fastify)     | `https://api.yourdomain.com` |

You will paste these into env vars as `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, `APP_URL`, and desktop build-time `VITE_*` values.

---

## 1. Generate secrets (on your machine)

Do this once per environment (staging vs production should differ).

### 1.1 JWT key pair (backend, required in production)

From the repo root:

```bash
pnpm --filter backend exec tsx scripts/generate-keys.ts
```

Or from `packages/backend`:

```bash
pnpm run generate-keys
```

Copy the printed **private** and **public** PEM blocks into your secret store. You will set `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (often as multiline env vars; your host may require `\n` escapes or base64—follow their docs).

### 1.2 DB encryption key (backend, required in production without AWS KMS)

64 hex characters (32 bytes):

```bash
openssl rand -hex 32
```

Set as `DB_ENCRYPTION_KEY` on the backend.

### 1.3 NextAuth secret (landing, required in production)

At least 32 random characters, e.g.:

```bash
openssl rand -base64 32
```

Set as `NEXTAUTH_SECRET` on Vercel (or your landing host).

---

## 2. Cloudflare R2 (screenshots, S3-compatible)

The backend presigns uploads to a bucket using the S3 API.

1. In **Cloudflare Dashboard** → **R2** → **Create bucket** (note the bucket name → `S3_SCREENSHOT_BUCKET`).
2. **R2** → **Manage** → **API tokens** → create a token with read/write on that bucket. Note:
   - Access Key Id → `AWS_ACCESS_KEY_ID`
   - Secret → `AWS_SECRET_ACCESS_KEY`
3. **Account ID** is in the R2 overview URL. Set:
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `AWS_REGION=auto`
   - `S3_FORCE_PATH_STYLE=true` (as in [.env.example](../packages/backend/.env.example))
4. Optional: add a **custom domain** for public reads and enable **CDN/caching** on that hostname (reduces egress; matches the phased plan). The backend still uses the S3 API endpoint for signing; public URLs depend on how you serve objects (CORS and bucket policies are your responsibility).

`KMS_SCREENSHOT_KEY_ID` is for AWS S3 + KMS only; R2 does not use it.

---

## 3. DigitalOcean managed PostgreSQL

1. **Databases** → **Create** → **PostgreSQL** (choose smallest tier for Phase 1).
2. Create a database user + database for TrackSync (or use the default user).
3. Copy the **connection string**. Append a pool limit for Phase 1, e.g.  
   `?sslmode=require&connection_limit=10`  
   (exact SSL param name may vary by provider; DigitalOcean usually provides a URI with TLS.)
4. This value becomes **`DATABASE_URL`** for the backend.

**Migrate before traffic**

From a machine that can reach the DB (or a CI job):

```bash
cd /path/to/repo
export DATABASE_URL="postgresql://..."   # your production URL
pnpm --filter backend exec prisma migrate deploy
```

Do **not** rely on `db push` for production if you already use `prisma/migrations`.

---

## 4. DigitalOcean managed Redis

1. **Databases** → **Create** → **Redis**.
2. Copy the **connection URL** (TLS if offered). Set **`REDIS_URL`** on the backend.

---

## 5. Run the backend API

### Option A — Droplet (Docker)

1. Create a **Droplet** (Ubuntu 22.04+, 2 vCPU / 4 GB RAM is a reasonable Phase 1 start).
2. Install Docker (official Docker docs for Ubuntu).
3. On your laptop or in CI, build and push the image (see [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) or):

   ```bash
   docker build -f packages/backend/Dockerfile -t ghcr.io/<org>/tracksync-backend:latest .
   docker push ghcr.io/<org>/tracksync-backend:latest
   ```

4. On the Droplet, create a `docker-compose` or `docker run` with all backend env vars (see section 7).
5. Put **NGINX** or **Caddy** in front with a TLS certificate (Let’s Encrypt), proxy `https://api.yourdomain.com` → `http://127.0.0.1:3001`.  
   Enable **`trustProxy`**-friendly headers (already supported in Fastify).

### Option B — DigitalOcean App Platform

Create an app from your container image, set env vars in the UI, expose HTTPS. Ensure health checks use **`/health/ready`**.

---

## 6. Backend environment variables (production checklist)

Set these in your host’s secret UI (replace examples):

| Variable                                                                      | Notes                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV`                                                                    | `production`                                              |
| `PORT`                                                                        | `3001` (or as exposed internally)                         |
| `DATABASE_URL`                                                                | Postgres URI + `connection_limit=10` (tune later)         |
| `REDIS_URL`                                                                   | Redis URI                                                 |
| `APP_URL`                                                                     | **HTTPS** landing origin (emails, links)                  |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`                                          | From step 1.1                                             |
| `DB_ENCRYPTION_KEY`                                                           | From step 1.2                                             |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`                                 | R2 token                                                  |
| `S3_ENDPOINT` / `AWS_REGION` / `S3_SCREENSHOT_BUCKET` / `S3_FORCE_PATH_STYLE` | R2 (step 2)                                               |
| `SMTP_*`                                                                      | Real SMTP for invites/password reset (or configure later) |
| `SENTRY_DSN`                                                                  | Optional                                                  |

After deploy, verify:

```bash
curl -sS https://api.yourdomain.com/health/ready
```

Expect JSON with `"status":"ok"` and `db` / `redis` ok.

---

## 7. Landing site (Vercel)

1. Import the Git repo; set **Root Directory** to `packages/landing`.
2. **Environment variables** (Production):

   | Variable              | Value                                                   |
   | --------------------- | ------------------------------------------------------- |
   | `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com`                            |
   | `NEXTAUTH_URL`        | `https://app.yourdomain.com`                            |
   | `NEXTAUTH_SECRET`     | From step 1.3                                           |
   | `NEXTAUTH_API_URL`    | Same as `NEXT_PUBLIC_API_URL` if the API is the backend |

3. Add your **custom domain** in Vercel; point DNS (CNAME) as instructed.
4. Deploy. Open `https://app.yourdomain.com` and confirm login flows hit your API.

If the API and app sit on different subdomains and you need cookie sharing, configure `COOKIE_DOMAIN` per [.env.example](../packages/landing/.env.example).

---

## 8. CORS and APP_URL

Production CORS allows only **`APP_URL`**. Set **`APP_URL`** on the backend to the **exact** browser origin of the landing (e.g. `https://app.yourdomain.com`, no trailing slash inconsistency).

---

## 9. Desktop app (Electron) — production builds

### 9.1 API and landing URLs in the client

When building installers, set (in CI env or `.env` used by the build):

- `VITE_API_URL=https://api.yourdomain.com`
- `VITE_LANDING_URL=https://app.yourdomain.com`

### 9.2 Auto-updates (`electron-updater`)

1. Cut a release with [`.github/workflows/release.yml`](../.github/workflows/release.yml) (tag `v*`).
2. Upload `latest.yml` (Windows) / `latest-mac.yml` (macOS) and artifacts to a **public HTTPS base URL**.
3. Set repository variable **`AUTO_UPDATE_BASE_URL`** to that folder URL (no trailing slash issues—trim in docs: one consistent URL).
4. Rebuild so the feed URL is **baked into** the app (see `electron.vite.config.ts`).

### 9.3 Optional Sentry in desktop

Set GitHub Actions variable **`SENTRY_DSN`** for the release workflow to bake the DSN into the main process.

---

## 10. GitHub configuration (desktop releases)

1. Ensure **Actions** can run on tag push.
2. Add **repository variables**: `AUTO_UPDATE_BASE_URL`, optional `SENTRY_DSN`.
3. Confirm **releases** publish artifacts users can download if you are not only using auto-update.

---

## 11. Monitoring (recommended manual steps)

1. **Uptime** — Create a monitor for `https://api.yourdomain.com/health/ready` (expect 200).
2. **Sentry** — Create projects for “backend” and “electron”; paste DSNs into backend env and desktop build env.
3. **Logs** — Point Droplet/App Platform log drain to your provider (Better Stack, Datadog, etc.). The API logs JSON to stdout in production.

---

## 12. Platform admin (`/admin`)

Grant sparingly in the database, e.g.:

```sql
UPDATE "User" SET is_platform_admin = true WHERE email = 'you@yourdomain.com';
```

(Exact table/column names match your Prisma schema.)

---

## 13. Phase 2+ (when you outgrow Phase 1)

When CPU, latency, or DB connections warrant it (see [RUNBOOK.md](../RUNBOOK.md) and [SCALING.md](./SCALING.md)):

1. Add a **load balancer** and second API instance.
2. Add Postgres **read replica**; set **`DATABASE_READ_URL`** on the backend.
3. Increase pool limits or add **PgBouncer** / provider pool.
4. Consider separate **worker** processes for BullMQ if queues lag.

---

## 14. Final verification checklist

- [ ] `GET /health/ready` and `/health/live` succeed on the public API URL.
- [ ] `GET /metrics` reachable from your monitoring network only (do not expose publicly without auth if possible).
- [ ] Landing login works end-to-end against production API.
- [ ] Desktop app can sign in, start timer, sync sessions (try on both macOS and Windows).
- [ ] Screenshot upload works (R2 credentials and CORS/bucket policy).
- [ ] Password reset email arrives (if SMTP configured).
- [ ] Desktop auto-update finds `latest.yml` (test a dummy higher version in a staging feed first).

---

## Related docs

- [RUNBOOK.md](../RUNBOOK.md) — operations, rollback, scaling triggers
- [docs/SCALING.md](./SCALING.md) — growth patterns
- [CONTRIBUTING.md](../CONTRIBUTING.md) — local development (including Windows)
