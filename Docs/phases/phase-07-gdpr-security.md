# Phase 7 — GDPR, MFA & Security Hardening (Week 22–24)

## Goal

The platform is compliant with GDPR and major employee monitoring laws. Employees can view, export, and request deletion of their own data. TOTP-based MFA is enforced for the roles configured by admins. All secrets are loaded from AWS Secrets Manager at startup. Security headers (CSP, HSTS, X-Frame-Options) are enforced across all surfaces. Penetration testing checklist completed.

---

## Prerequisites

- Phase 1–6 complete: All core features working
- AWS Secrets Manager entries populated for all sensitive values
- Privacy policy and DPA (Data Processing Agreement) documents drafted (legal)
- `AuditLog` table exists (Phase 5)

---

## Key Packages to Install

### Backend
```bash
pnpm add @aws-sdk/client-secrets-manager
pnpm add otplib qrcode            # (may be installed already from Phase 1)
pnpm add archiver                 # ZIP export for GDPR data packages
pnpm add -D @types/archiver
```

### Web
```bash
pnpm add react-qr-code            # Display TOTP QR code in browser
```

---

## Database Migrations

```prisma
model ConsentRecord {
  id          String   @id @default(uuid())
  user_id     String
  org_id      String
  version     String   // e.g. "1.0", "1.1"
  given_at    DateTime @default(now())
  withdrawn_at DateTime?
  ip_address  String?
  user_agent  String?
  scope       String[] // ["screenshot", "activity", "app_tracking"]

  user        User     @relation(fields: [user_id], references: [id])
}

model DeletionRequest {
  id            String    @id @default(uuid())
  user_id       String
  org_id        String
  requested_at  DateTime  @default(now())
  processed_at  DateTime?
  status        String    @default("pending")  // pending | processing | completed | failed
  requested_by  String    // user_id (self) or admin_id
  notes         String?

  user          User      @relation(fields: [user_id], references: [id])
}
```

Run:
```bash
pnpm prisma migrate dev --name phase-07-gdpr-security
```

---

## Files to Create

| File | Description |
|------|------------|
| `src/lib/secrets.ts` | Load all secrets from Secrets Manager at startup |
| `src/routes/gdpr/consent.ts` | Record and withdraw consent |
| `src/routes/gdpr/export.ts` | Generate and download personal data export |
| `src/routes/gdpr/deletion.ts` | Submit and process deletion requests |
| `src/routes/auth/mfa.ts` | TOTP setup + enable + disable + backup codes (Phase 1 enhanced) |
| `src/queues/workers/dataDeletion.ts` | BullMQ: process deletion requests |
| `src/queues/workers/dataExport.ts` | BullMQ: generate data export package |
| Desktop: `src/main/consent/index.ts` | Show consent screen, store consent record |
| Desktop: `src/renderer/pages/ConsentGate.tsx` | Consent modal before first tracking |
| Desktop: `src/renderer/pages/MfaSetup.tsx` | TOTP setup flow |
| Desktop: `src/renderer/pages/PrivacyPortal.tsx` | View/export/delete own data |
| Web: `app/dashboard/team/[userId]/privacy/page.tsx` | Admin view of user consent |
| Web: `app/(employee)/privacy/page.tsx` | Employee privacy portal |
| Web: `app/(auth)/mfa-setup/page.tsx` | Forced MFA setup flow |

---

## Backend Tasks

### Secrets Manager (`src/lib/secrets.ts`)

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({ region: process.env.AWS_REGION })

export async function loadSecrets(): Promise<void> {
  const secretIds = [
    'tracksync/database-url',
    'tracksync/database-read-url',
    'tracksync/redis-url',
    'tracksync/jwt-private-key',
    'tracksync/jwt-public-key',
    'tracksync/stripe-secret-key',
    'tracksync/stripe-webhook-secret',
    'tracksync/kms-screenshot-key-id',
    'tracksync/kms-integration-key-id',
  ]
  const results = await Promise.all(secretIds.map(async (id) => {
    const cmd = new GetSecretValueCommand({ SecretId: id })
    const result = await client.send(cmd)
    return [id.split('/').pop()!, result.SecretString!] as [string, string]
  }))
  for (const [key, value] of results) {
    process.env[key.toUpperCase().replace(/-/g, '_')] = value
  }
}
// Call loadSecrets() before Fastify starts in src/main.ts
```

### Consent API

- [ ] `POST /v1/gdpr/consent`
  ```
  Request:  { version: "1.0", scope: ["screenshot", "activity", "app_tracking"] }
  Response: { consent_id }
  Auth: employee (self)
  ```
  - Create `ConsentRecord` with `ip_address` and `user_agent`
  - Update `User.consent_given = true` (add this field to User model)

- [ ] `DELETE /v1/gdpr/consent`
  ```
  Response: { withdrawn_at }
  Auth: employee (self)
  ```
  - Set `ConsentRecord.withdrawn_at = now()`
  - Stop all tracking for this user: desktop app receives `'tracking:consent_withdrawn'` WebSocket event
  - Emit via WebSocket to `user:{userId}`

- [ ] `GET /v1/gdpr/consent` — get current consent status for authenticated user

### Data Export API

- [ ] `POST /v1/gdpr/export`
  ```
  Response: { job_id, message: "Export will be emailed within 1 hour" }
  Auth: employee (self) or admin (for any user in org)
  ```
  - Enqueue `dataExport` BullMQ job

- [ ] BullMQ Worker `src/queues/workers/dataExport.ts`:
  - Collect: user profile, all sessions, all activity logs, screenshot metadata (not files — too large)
  - Build JSON + CSV files
  - ZIP with `archiver`
  - Upload to S3 (temp key with 24h TTL)
  - Email signed download URL to user

### Data Deletion API

- [ ] `POST /v1/gdpr/deletion`
  ```
  Request:  { reason? }
  Response: { request_id, message: "Request received, processed within 30 days" }
  Auth: employee (self) or admin
  ```
  - Create `DeletionRequest`
  - Enqueue `dataDeletion` BullMQ job

- [ ] BullMQ Worker `src/queues/workers/dataDeletion.ts`:
  - Delete: all `TimeSession` records, all `ActivityLog`, all `Screenshot` + S3 objects
  - Anonymise (do not delete): `AuditLog` entries referencing this user — replace `user_id` with a hashed tombstone
  - Delete: `User` record (or anonymise if required by accounting/audit laws)
  - Mark `DeletionRequest.status = 'completed'`
  - Send confirmation email
  - **30-day processing window** — schedule as delayed BullMQ job (30 days)

### MFA Enforcement Middleware

- [ ] Add to `authenticate` middleware:
  ```typescript
  const settings = await getOrgSettings(req.user.orgId)
  const requiresMfa =
    (req.user.role === 'admin' && settings.mfa_required_for_admins) ||
    (req.user.role === 'manager' && settings.mfa_required_for_managers) ||
    (req.user.role === 'super_admin')

  if (requiresMfa && !req.user.mfa_enabled) {
    return reply.code(403).send({ error: 'MFA_REQUIRED', setup_url: '/auth/mfa/setup' })
  }
  ```
- [ ] Frontend handles `MFA_REQUIRED` error by redirecting to MFA setup

### Security Headers (Backend)

- [ ] Add to Fastify via `@fastify/helmet`:
  ```typescript
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'wss://api.tracksync.io'],
        imgSrc: ["'self'", 'data:', 'https://tracksync-screenshots-*.s3.amazonaws.com'],
        frameSrc: ["'none'"],
      }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
  ```

### Security Headers (Next.js — `next.config.js`)

```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'nonce-{NONCE}'",
      "connect-src 'self' https://api.tracksync.io wss://api.tracksync.io",
      "img-src 'self' data: https://*.s3.amazonaws.com",
      "frame-src 'none'",
    ].join('; ')
  }
]
```

### Rate Limiting Review

- [ ] Audit all routes against rate limiting table:
  | Route | Limit | Window |
  |-------|-------|--------|
  | `POST /v1/auth/login` | 10 | 15 min |
  | `POST /v1/auth/signup` | 5 | 1 hour |
  | `POST /v1/auth/mfa/verify` | 5 | 5 min |
  | `POST /v1/gdpr/deletion` | 1 | 24 hours |
  | `POST /v1/gdpr/export` | 3 | 24 hours |
  | `GET /v1/reports/export` | 10 | 1 hour |

---

## Desktop App Tasks

### Consent Gate (`src/renderer/pages/ConsentGate.tsx`)

- [ ] Show on first launch before any tracking starts
- [ ] List exactly what is collected: screenshots every N minutes, keyboard/mouse counts (not content), active app name, URLs
- [ ] Two buttons: "I Agree" and "I Decline"
- [ ] On "I Agree": call `POST /v1/gdpr/consent`, store `consent_id` in keychain
- [ ] On "I Decline": show message "Tracking will not start. You can grant consent later in Settings."
- [ ] Re-show consent gate if: org's consent version changes, or user reinstalls app

### Consent Withdrawal in Desktop

- [ ] On `tracking:consent_withdrawn` WebSocket event: stop timer, stop screenshot scheduler, stop iohook, show "Tracking paused — consent withdrawn" message

### Privacy Portal (`src/renderer/pages/PrivacyPortal.tsx`)

- [ ] "What TrackSync Sees" section: list current data being collected
- [ ] "Download My Data" button → `POST /v1/gdpr/export`
- [ ] "Delete My Account & Data" button → confirm dialog → `POST /v1/gdpr/deletion`
- [ ] "Withdraw Consent" button → `DELETE /v1/gdpr/consent`
- [ ] View recent screenshots (last 10, with blurring if org enabled)

### MFA Setup (`src/renderer/pages/MfaSetup.tsx`)

- [ ] Display QR code from `POST /v1/auth/mfa/setup`
- [ ] TOTP code input field
- [ ] On successful `POST /v1/auth/mfa/enable`: show 8 backup codes, prompt to save them
- [ ] On forced MFA: block all other UI until setup is complete

---

## Web Admin Panel Tasks

### Employee Privacy Portal (`app/(employee)/privacy/page.tsx`)

- [ ] Same privacy portal functionality as desktop, but in browser
- [ ] Accessible at `/privacy` for all employee roles

### Admin: User Consent View (`app/dashboard/team/[userId]/privacy/page.tsx`)

- [ ] Show consent status and date for each employee
- [ ] Show data deletion request status if pending

### MFA Setup Page (`app/(auth)/mfa-setup/page.tsx`)

- [ ] Full-page MFA setup flow for admin/manager who has `MFA_REQUIRED` enforced
- [ ] QR code using `react-qr-code`
- [ ] Forced redirect here when `403 MFA_REQUIRED` received

---

## Penetration Testing Checklist

Before marking this phase complete, run through:

- [ ] SQL injection: test all query params with `' OR 1=1` patterns
- [ ] IDOR: verify user A cannot read/modify user B's sessions, screenshots, activity logs
- [ ] JWT replay: confirm blacklisted `jti` is rejected
- [ ] Rate limiting: confirm login lockout after 10 attempts
- [ ] SSRF: attempt to reach `http://169.254.169.254` via integration webhook URL
- [ ] XSS: test all user-supplied fields rendered in admin panel
- [ ] CSRF: confirm state-changing requests require authentication (no CSRF tokens needed for API-only)
- [ ] S3 key enumeration: confirm signed URLs are per-user and expire
- [ ] WebSocket auth: confirm unauthenticated WebSocket connection is rejected

---

## Definition of Done

1. All secrets load from AWS Secrets Manager at app startup — no hardcoded keys in codebase
2. TOTP MFA enforced for super_admin — cannot access dashboard without MFA enabled
3. `POST /v1/gdpr/export` emails a ZIP file within 1 hour containing all user data
4. `POST /v1/gdpr/deletion` schedules deletion, processes within 30 days, sends confirmation email
5. Desktop app shows consent screen on first run — tracking does not start without consent
6. Withdrawing consent stops tracking on desktop within 5 seconds
7. All security headers visible in browser DevTools on every page of admin panel and API responses
8. Pen test checklist above: all items pass

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| Secrets loaded from Secrets Manager (mock) | Unit | Vitest |
| Consent record created with correct scope | Integration | Vitest |
| Withdrawal emits WebSocket event | Integration | Vitest + ws client |
| Data export job creates ZIP with all user data | Integration | Vitest |
| Deletion job removes sessions + S3 objects | Integration | Vitest + localstack |
| `MFA_REQUIRED` error returned when enforced | Integration | Vitest |
| CSP header present on all routes | Integration | Vitest + supertest |
| HSTS header present | Integration | Vitest |
| X-Frame-Options DENY | Integration | Vitest |
| Consent gate shown on first launch | E2E | Playwright (Electron) |
| MFA setup flow completes successfully | E2E | Playwright |
| IDOR: user cannot access another's data | Integration | Vitest |
