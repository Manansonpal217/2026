# Backend Module 01 — Authentication & JWT

**Stack:** Node.js + Fastify + TypeScript  
**Used by:** Desktop App (all employees), Web Admin Panel (all roles)

---

## Overview

Handles login, SSO (Google/Microsoft), JWT issuance + refresh, logout, and session management. Supports four roles: `super_admin`, `org_admin`, `manager`, `employee`. Desktop app uses a separate `desktop_token` mechanism for long-lived sessions stored in OS keychain.

---

## API Versioning

> All endpoints are prefixed with `/v1/`. This is mandatory from day one so that older desktop app versions continue to work when the API evolves. The desktop app always specifies the version it was built against.

```typescript
// Fastify registration
fastify.register(v1Routes, { prefix: '/v1' })

// All route definitions use relative paths:
// '/app/auth/login' → accessible at '/v1/app/auth/login'
```

Breaking API changes increment to `/v2/`. Both versions run simultaneously until all desktop clients have auto-updated (tracked via `User-Agent` header containing app version).

---

## Endpoints

### POST `/v1/app/auth/login`

Employee login from desktop app.

```typescript
Body: { email: string, password: string }

Response: {
  access_token: string,    // JWT, 15 min expiry
  refresh_token: string,   // Opaque token, 30 days
  user: { id, name, email, role, org_id, org_name },
  org_settings: { ...all feature flags }
}

Errors:
  401 → Invalid credentials
  403 → Account suspended / inactive
  402 → Org suspended
```

### POST `/web/auth/login`

Web panel login (org admin, manager, super admin).

```typescript
// Same body/response shape as /app/auth/login
// Returns role-appropriate redirect URL in response
```

### GET `/app/auth/sso/:provider`

Initiates OAuth SSO flow for desktop app.

```typescript
Params: provider = 'google' | 'microsoft'

Response: Redirect to provider's OAuth consent screen
Callback: /app/auth/sso/:provider/callback
    → Exchanges code for tokens
    → Creates/updates user record
    → Issues JWT pair
    → Redirects to: tracksync://auth/callback?token=<access_token>&refresh=<refresh_token>
```

### POST `/app/auth/refresh`

Refresh access token.

```typescript
Body: { refresh_token: string }

Response: {
  access_token: string,   // new JWT
  refresh_token: string   // new refresh token (rotation)
}

Errors:
  401 → Invalid or expired refresh token
  402 → Org suspended (cannot refresh)
```

### POST `/app/auth/logout`

Invalidate session.

```typescript
Headers: Authorization: Bearer <access_token>
Body: { refresh_token: string }

Action: Deletes refresh_token from DB, blacklists JWT in Redis until expiry
Response: 200 OK
```

### GET `/app/me`

Current user info (called on app launch).

```typescript
Response: {
  user: { id, name, email, role, org_id, org_name, avatar_url },
  org: { id, name, status, plan },
  org_settings: { ...all feature flags }
}
```

---

## JWT Structure

```typescript
// Access Token Payload — MUST include jti for blacklisting to work
{
  jti: crypto.randomUUID(),   // ← REQUIRED: unique token ID for blacklisting on logout
  sub: "<user_uuid>",
  org_id: "<org_uuid>",
  role: "employee" | "manager" | "org_admin" | "super_admin",
  iat: 1234567890,
  exp: 1234568790   // +15 minutes
}
```

Signed with RS256 (asymmetric — public key can be shared for verification).

> **Why `jti` is mandatory:** Logout works by adding `jti` to a Redis blacklist. Without `jti`, you cannot blacklist a specific token — only invalidate all tokens for a user (which logs them out of all devices). With `jti`, a single-device logout is possible.

### Issuing a JWT (must include jti)

```typescript
import { SignJWT } from 'jose'
import { randomUUID } from 'crypto'

async function issueAccessToken(user: User): Promise<string> {
  return new SignJWT({
    jti: randomUUID(), // unique per token — used for blacklist key
    sub: user.id,
    org_id: user.org_id,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(RS256_PRIVATE_KEY)
}
```

---

## Refresh Token Storage

```sql
refresh_tokens
  id          UUID PRIMARY KEY
  user_id     UUID FK → users
  token_hash  VARCHAR   -- bcrypt hash of the opaque token
  expires_at  TIMESTAMP
  created_at  TIMESTAMP
  revoked_at  TIMESTAMP  -- NULL until logout
```

---

## Middleware: `authenticateRequest`

Applied to all protected routes.

```typescript
async function authenticateRequest(request, reply) {
  const token = request.headers.authorization?.split(' ')[1]
  if (!token) return reply.code(401).send({ code: 'MISSING_TOKEN' })

  const payload = verifyJWT(token) // throws if invalid/expired

  // Blacklist check uses payload.jti (not the raw token string)
  // Without jti this check was effectively a no-op
  if (await redis.exists(`blacklist:${payload.jti}`)) {
    return reply.code(401).send({ code: 'TOKEN_REVOKED' })
  }

  request.user = await getUser(payload.sub)
  request.org = await getOrg(payload.org_id)
}
```

## Middleware: `checkOrgAccess`

Applied after auth on all employee/org routes.

```typescript
async function checkOrgAccess(request, reply) {
  if (request.org.status === 'suspended') {
    return reply.code(402).send({
      code: 'ORG_SUSPENDED',
      message: 'Your organization access has been suspended.',
      reason: request.org.suspension_reason,
    })
  }
}
```

## Middleware: `requireRole`

```typescript
const requireRole =
  (...roles: Role[]) =>
  (request, reply, next) => {
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ code: 'FORBIDDEN' })
    }
    next()
  }

// Usage:
fastify.get('/super-admin/*', { preHandler: [requireRole('super_admin')] }, handler)
fastify.get('/admin/*', { preHandler: [requireRole('org_admin', 'super_admin')] }, handler)
```

---

## Logout — Blacklisting the Access Token

```typescript
async function logout(request, reply) {
  const token = request.headers.authorization?.split(' ')[1]
  const payload = verifyJWT(token)

  // Blacklist this specific token until its natural expiry
  const ttl = payload.exp - Math.floor(Date.now() / 1000)
  if (ttl > 0) {
    await redis.set(`blacklist:${payload.jti}`, '1', 'EX', ttl)
  }

  // Also revoke the refresh token
  const { refresh_token } = request.body
  await prisma.refresh_tokens.updateMany({
    where: { user_id: payload.sub, revoked_at: null },
    data: { revoked_at: new Date() },
  })

  return reply.code(200).send({ success: true })
}
```

---

## Redis Usage

| Key                     | Value                   | TTL                                       |
| ----------------------- | ----------------------- | ----------------------------------------- |
| `blacklist:<token_jti>` | `1`                     | Remaining lifetime of the token (seconds) |
| `session:<user_id>`     | Last activity timestamp | 1 hour rolling                            |

---

## Rate Limiting Strategy (All Backend Endpoints)

> Rate limiting must be applied globally — not just on login. Missing rate limits on upload/sync endpoints enable S3 cost abuse and database flooding.

```typescript
// Fastify global rate limit plugin
import rateLimit from '@fastify/rate-limit'

fastify.register(rateLimit, {
  global: true, // applies to all routes unless overridden
  max: 200, // 200 requests per minute per IP (global default)
  timeWindow: '1 minute',
  redis: redisClient, // Redis-backed for distributed rate limiting across instances
  keyGenerator: (request) => {
    // Prefer user ID over IP (more accurate for authenticated routes)
    return request.user?.id ?? request.ip
  },
})

// Per-route overrides:
fastify.post(
  '/v1/app/auth/login',
  {
    config: { rateLimit: { max: 5, timeWindow: '5 minutes', keyGenerator: (r) => r.ip } },
  },
  loginHandler
)

fastify.post(
  '/v1/app/auth/refresh',
  {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  },
  refreshHandler
)

fastify.post(
  '/v1/app/screenshots/upload',
  {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } }, // max 3/min upload
  },
  uploadHandler
)

fastify.post(
  '/v1/app/activity-logs',
  {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, // 100 logs/min max
  },
  activityLogHandler
)

fastify.post(
  '/v1/app/sessions/sync',
  {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  },
  sessionSyncHandler
)
```

### Per-Org Upload Limits (Abuse Prevention)

```typescript
// Additional org-level quota check on screenshot upload
async function checkOrgUploadQuota(orgId: string): Promise<void> {
  const key = `upload_quota:${orgId}:${getCurrentHour()}`
  const count = await redis.incr(key)
  await redis.expire(key, 3600)

  const MAX_SCREENSHOTS_PER_ORG_PER_HOUR = 10_000 // 200 users × 50/hour
  if (count > MAX_SCREENSHOTS_PER_ORG_PER_HOUR) {
    throw new Error('Upload quota exceeded for organization')
  }
}
```

---

## Security Measures

- Passwords hashed with bcrypt (cost factor 12)
- Refresh tokens stored as bcrypt hash (never plaintext)
- JWT `jti` (unique ID) included in every token — enables precise per-token blacklisting
- JWT blacklist on logout (stored in Redis using `jti` as key, TTL = token remaining lifetime)
- Refresh token rotation on every use (detect replay attacks)
- Rate limiting on all endpoints (Redis-backed, per-user + per-IP + per-org)
- All auth endpoints over HTTPS only (TLS 1.3)
- MFA enforced for super_admin, configurable for org_admin (see Backend Module 14)
- SSRF protection on all integration domain inputs (see Backend Module 05)
- KMS envelope encryption for integration credentials (see Backend Module 05)
- CSP + security headers on web admin panel (see Admin Panel Module — Security)
