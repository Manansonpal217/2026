# Phase 1 — Authentication & Organisation Onboarding (Week 3–5)

## Goal

Users can sign up for an organisation account, invite team members, and the desktop app logs in and persists a secure session using the OS keychain. The full JWT + refresh-token rotation pipeline is live, including `jti` blacklisting via Redis. Super admins have mandatory MFA (TOTP) enforced.

---

## Prerequisites

- Phase 0 complete: Fastify is running, Prisma connects to PostgreSQL, Redis is up
- S3 bucket and KMS key exist in staging
- Email provider credentials in Secrets Manager (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` or SES ARN)

---

## Key Packages to Install

### Backend
```bash
pnpm add @fastify/jwt bcryptjs uuid
pnpm add nodemailer @aws-sdk/client-ses
pnpm add otplib qrcode           # TOTP / MFA
pnpm add -D @types/bcryptjs @types/nodemailer @types/uuid
```

### Desktop
```bash
pnpm add keytar                  # OS keychain
pnpm add -D @types/keytar
```

### Web
```bash
pnpm add next-auth               # Admin panel session management
pnpm add jose                    # JWT verification in Next.js middleware
```

---

## Database Migrations

Add to `prisma/schema.prisma`:

```prisma
model Organization {
  id                   String    @id @default(uuid())
  name                 String
  slug                 String    @unique
  plan                 String    @default("trial")          // trial | starter | pro | enterprise
  status               String    @default("active")         // active | suspended | trial_expired
  data_region          String    @default("us-east-1")
  trial_ends_at        DateTime?
  trial_expired        Boolean   @default(false)
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt

  users                User[]
  org_settings         OrgSettings?
  invites              Invite[]
}

model OrgSettings {
  id                              String  @id @default(uuid())
  org_id                          String  @unique
  screenshot_interval_seconds     Int     @default(300)
  screenshot_retention_days       Int     @default(30)
  blur_screenshots                Boolean @default(false)
  activity_weight_keyboard        Float   @default(0.5)
  activity_weight_mouse           Float   @default(0.3)
  activity_weight_movement        Float   @default(0.2)
  time_approval_required          Boolean @default(false)
  mfa_required_for_admins         Boolean @default(false)
  mfa_required_for_managers       Boolean @default(false)

  organization                    Organization @relation(fields: [org_id], references: [id])
}

model User {
  id             String    @id @default(uuid())
  org_id         String
  email          String
  password_hash  String
  role           String    @default("employee")  // super_admin | admin | manager | employee
  name           String
  timezone       String    @default("UTC")
  status         String    @default("active")    // active | invited | suspended
  mfa_enabled    Boolean   @default(false)
  mfa_secret     String?
  mfa_backup_codes String[] @default([])
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  organization   Organization   @relation(fields: [org_id], references: [id])
  refresh_tokens RefreshToken[]

  @@unique([email, org_id])
}

model RefreshToken {
  id          String   @id @default(uuid())
  user_id     String
  token_hash  String   @unique
  device_id   String?
  expires_at  DateTime
  created_at  DateTime @default(now())

  user        User     @relation(fields: [user_id], references: [id])
}

model Invite {
  id          String   @id @default(uuid())
  org_id      String
  email       String
  role        String   @default("employee")
  token       String   @unique @default(uuid())
  accepted_at DateTime?
  expires_at  DateTime
  created_at  DateTime @default(now())

  organization Organization @relation(fields: [org_id], references: [id])
}
```

Run:
```bash
pnpm prisma migrate dev --name phase-01-auth
```

**Redis keys to use:**
- `jti:blacklist:{jti}` → SET with TTL matching token expiry (JWT revocation)
- `rate:login:{ip}` → INCR with 15-minute window (max 10 attempts)
- `rate:signup:{ip}` → INCR with 1-hour window (max 5 orgs)
- `mfa:pending:{user_id}` → Store `{ jti }` for the partially-authenticated session (TTL 5 min)

---

## Files to Create

| File | Description |
|------|------------|
| `src/routes/auth/signup.ts` | Self-serve org signup |
| `src/routes/auth/login.ts` | Login + partial auth for MFA |
| `src/routes/auth/logout.ts` | Blacklist `jti`, delete refresh token |
| `src/routes/auth/refresh.ts` | Rotate refresh token |
| `src/routes/auth/invite.ts` | Accept invite, create user |
| `src/routes/auth/mfa.ts` | TOTP setup + verify |
| `src/middleware/authenticate.ts` | `fastify.decorate('authenticate', ...)` |
| `src/lib/jwt.ts` | `issueAccessToken`, `issueRefreshToken`, `verifyToken` |
| `src/lib/email.ts` | `sendVerificationEmail`, `sendInviteEmail` |
| `src/lib/password.ts` | `hashPassword`, `comparePassword` |
| `src/lib/mfa.ts` | TOTP generate, verify, backup codes |
| Desktop: `src/main/auth/keychain.ts` | `storeTokens`, `loadTokens`, `clearTokens` |
| Desktop: `src/main/auth/session.ts` | `ensureValidSession`, auto-refresh |
| Desktop: `src/renderer/pages/Login.tsx` | Login page |
| Desktop: `src/renderer/pages/Onboarding.tsx` | First-run onboarding flow |
| Web: `app/(auth)/login/page.tsx` | Admin panel login |
| Web: `app/(auth)/invite/[token]/page.tsx` | Accept invite |
| Web: `middleware.ts` | Next.js route guard using `jose` |

---

## Backend Tasks

### Self-Serve Signup

- [ ] `POST /v1/auth/signup`
  ```
  Request:  { org_name, slug, full_name, email, password, data_region }
  Response: { message: "Verification email sent" }
  ```
  - Validate: no disposable/personal email domains (check against block list)
  - Validate: `slug` is URL-safe, unique
  - Hash password with `bcrypt` (rounds: 12)
  - Create `Organization` + `OrgSettings` (defaults) + `User` (role: `super_admin`)
  - Send email verification link (token stored in Redis: `email:verify:{token}` → `userId`, TTL 24h)
  - Rate limit: 5 signups / hour / IP

- [ ] `GET /v1/auth/verify-email?token=`
  - Look up token in Redis, mark user as verified, delete token

### Login

- [ ] `POST /v1/auth/login`
  ```
  Request:  { email, password, org_slug }
  Response (no MFA): { access_token, refresh_token, user }
  Response (MFA pending): { mfa_required: true, mfa_token: "<short-lived-jwt>" }
  ```
  - Rate limit: 10 attempts / 15 min / IP + per-user lockout after 5 failures
  - bcrypt compare password
  - If `mfa_enabled`, issue a short-lived "MFA pending" JWT (TTL 5 min) with a limited scope claim
  - If no MFA: issue access token (15 min) + refresh token (30 days); store refresh token hash in DB

- [ ] `POST /v1/auth/mfa/verify`
  ```
  Request:  { mfa_token, totp_code }
  Response: { access_token, refresh_token, user }
  ```
  - Verify `mfa_token` signature + `mfa_pending` scope claim
  - Verify TOTP code (allow ±1 step drift)
  - Issue full access + refresh tokens

- [ ] `POST /v1/auth/refresh`
  ```
  Request:  { refresh_token }   (or httpOnly cookie)
  Response: { access_token, refresh_token }
  ```
  - Verify hash matches DB; rotate: delete old, insert new refresh token
  - Blacklist old access token's `jti` in Redis

- [ ] `POST /v1/auth/logout`
  ```
  Request:  (authenticated — uses Bearer token)
  Response: { message: "Logged out" }
  ```
  - Blacklist `jti` in Redis: `SET jti:blacklist:{jti} 1 EX {remaining_ttl}`
  - Delete refresh token from DB

### JWT Library (`src/lib/jwt.ts`)

- [ ] `issueAccessToken(userId, orgId, role)` → signed RS256 JWT, 15 min, includes `jti`
- [ ] `issueRefreshToken(userId, deviceId?)` → random 64-byte hex, store SHA-256 hash in DB
- [ ] `verifyToken(token)` → verify signature → check Redis `jti:blacklist:{jti}` → throw if blacklisted

### Authenticate Middleware

- [ ] `fastify.decorate('authenticate', async (req, reply) => { ... })`
  - Extract Bearer token
  - `verifyToken(token)` — throws `401` if expired/blacklisted
  - Load user from DB, attach to `req.user`
  - Check `user.status === 'active'` and `org.status === 'active'`

### Invite Flow

- [ ] `POST /v1/auth/invite` (admin+ only)
  ```
  Request:  { email, role }
  Response: { invite_id }
  ```
- [ ] `POST /v1/auth/invite/accept`
  ```
  Request:  { token, full_name, password }
  Response: { access_token, refresh_token, user }
  ```

### MFA Setup (for logged-in users)

- [ ] `POST /v1/auth/mfa/setup` → generate TOTP secret, return `{ qr_code_url, secret }`
- [ ] `POST /v1/auth/mfa/enable` → verify TOTP, save encrypted secret, generate 8 backup codes
- [ ] `POST /v1/auth/mfa/disable` → require current password + TOTP, clear secret

---

## Desktop App Tasks

### Keychain Token Storage (`src/main/auth/keychain.ts`)

- [ ] `storeTokens(accessToken, refreshToken)` → `keytar.setPassword('tracksync', 'access_token', ...)` + `keytar.setPassword('tracksync', 'refresh_token', ...)`
- [ ] `loadTokens()` → return `{ accessToken, refreshToken }` or `null`
- [ ] `clearTokens()` → `keytar.deletePassword(...)` for both

### Session Manager (`src/main/auth/session.ts`)

- [ ] `ensureValidSession()`:
  1. Load tokens from keychain
  2. Decode access token, check `exp` — if > 60s remaining, return it
  3. Else call `POST /v1/auth/refresh` → store new tokens in keychain → return new access token
  4. If refresh fails (401), clear keychain tokens, emit `ipcMain` event `'auth:session-expired'`

### IPC Handlers (in `src/main/index.ts`)

- [ ] `ipcMain.handle('auth:login', async (_, { email, password, orgSlug }) => { ... })`
  - POST to backend, store tokens, return `{ user }`
- [ ] `ipcMain.handle('auth:logout', async () => { ... })`
  - POST `/v1/auth/logout` with current token, clear keychain
- [ ] `ipcMain.handle('auth:get-current-user', async () => { ... })`
  - Load tokens, `ensureValidSession`, decode JWT, return user claims

### UI

- [ ] `src/renderer/pages/Login.tsx` — Email + password fields, "Sign in" button, org slug field
- [ ] On login success: route to main app screen
- [ ] On `auth:session-expired` IPC event: show lock screen, prompt re-login (do NOT lose unsaved tracking data)

---

## Web Admin Panel Tasks

- [ ] `app/(auth)/login/page.tsx` — Login form calling `POST /v1/auth/login`
- [ ] `app/(auth)/invite/[token]/page.tsx` — Accept invite form
- [ ] `middleware.ts` — Protect all `/dashboard/*` routes:
  ```typescript
  import { jwtVerify } from 'jose'
  // If no valid session cookie → redirect to /login
  ```
- [ ] `lib/api.ts` — Attach `Authorization: Bearer` from session cookie to all API calls
- [ ] Admin: `app/dashboard/team/page.tsx` — List users + "Invite" button + role selector
- [ ] Admin: `app/dashboard/team/invite-modal.tsx` — Send invite dialog

---

## Definition of Done

1. `POST /v1/auth/signup` creates an org + super_admin user + sends verification email
2. `POST /v1/auth/login` with correct credentials returns JWT access token (15 min) and refresh token (30 days)
3. Refresh token rotation works: old refresh token is invalid after one use
4. Blacklisted `jti` (after logout) is rejected by the `authenticate` middleware with 401
5. Electron app stores tokens in OS keychain (`keytar`) — confirmed via `keytar.getPassword(...)` in dev tools
6. Session auto-refresh works: modifying token expiry to 1 minute and waiting triggers a silent refresh
7. Invite email arrives, invite link creates a new user in the correct org with the correct role
8. TOTP MFA can be enabled via API, and a login with `mfa_required: true` requires a valid TOTP code to complete
9. Next.js admin panel login page authenticates and sets a session cookie; protected routes redirect unauthenticated users to `/login`
10. `pnpm test` (unit) passes for: `jwt.ts`, `password.ts`, `mfa.ts`

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| Signup creates org + user in DB | Integration | Vitest + real DB (test container) |
| Login returns valid JWT | Integration | Vitest + supertest |
| Wrong password returns 401 | Integration | Vitest |
| Rate limiter blocks after 10 attempts | Integration | Vitest loop |
| Refresh token rotates on use | Integration | Vitest |
| Blacklisted jti rejected | Integration | Vitest |
| `verifyToken` unit tests | Unit | Vitest |
| `hashPassword` + `comparePassword` | Unit | Vitest |
| TOTP generate + verify cycle | Unit | Vitest |
| Keychain store/load/clear in Electron | Manual | Dev console |
| Session auto-refresh | Manual | Set short expiry, wait |
| Admin panel login + protected route | E2E | Playwright |
