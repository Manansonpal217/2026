# Backend Module 14 — Multi-Factor Authentication (MFA / 2FA)

**Stack:** Node.js + Fastify + Prisma + PostgreSQL + Redis  
**Used by:** Super Admin (mandatory), Org Admin (enforced by org policy), Manager/Employee (optional)

---

## Overview

MFA adds a second verification factor after password login. It is **mandatory for `super_admin`** (who controls all org data), **enforceable per org for `org_admin`** (who can view all employee screenshots), and optional for other roles. Supports TOTP (Google Authenticator, Authy) and backup codes.

---

## Database Schema

```sql
mfa_credentials
  id              UUID PRIMARY KEY
  user_id         UUID FK → users UNIQUE
  type            ENUM(totp)                   -- totp only in v1; webauthn in v2
  totp_secret     VARCHAR ENCRYPTED            -- base32 TOTP secret (AES-256 encrypted)
  backup_codes    JSONB                        -- array of bcrypt-hashed one-time codes
  enabled_at      TIMESTAMP
  last_used_at    TIMESTAMP
  created_at      TIMESTAMP

-- Per-org MFA enforcement policy
-- (in org_settings table, add these fields:)
-- mfa_required_for_admins   BOOLEAN DEFAULT false
-- mfa_required_for_managers BOOLEAN DEFAULT false
```

---

## MFA Setup Flow (TOTP)

### Step 1: Generate Secret & QR Code

```typescript
POST /v1/web/auth/mfa/setup
Auth: requires valid JWT (not yet MFA-verified)

Action:
  1. Generate 20-byte random TOTP secret: base32 encode → store encrypted
  2. Generate otpauth:// URI for QR code:
     otpauth://totp/TrackSync:<user.email>?secret=<base32>&issuer=TrackSync&digits=6&period=30
  3. Return: { qr_code_url: "data:image/png;base64,...", secret: "<base32>" }
     (secret shown once for manual entry in authenticator apps)
  4. Store secret in DB with enabled_at = NULL (not yet confirmed)
```

### Step 2: Verify & Enable

```typescript
POST /v1/web/auth/mfa/verify-setup
Body: { totp_code: "123456" }

Action:
  1. Load pending mfa_credentials for user (enabled_at = NULL)
  2. Verify TOTP code against stored secret (allow ±1 period for clock drift)
  3. If valid:
     a. SET enabled_at = NOW()
     b. Generate 10 backup codes (random 8-char alphanumeric)
     c. Bcrypt-hash each backup code, store array in backup_codes JSONB
     d. Return plaintext backup codes ONCE (user must save them)
  4. If invalid: return 400 "Invalid code"
```

### Backup Codes

```typescript
// Backup codes are single-use, bcrypt-hashed in DB
// Each code is 8 characters: e.g., "X4K2-M9P7"

function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    return `${code.slice(0, 4)}-${code.slice(4, 8)}`
  })
}

async function useBackupCode(userId: string, inputCode: string): Promise<boolean> {
  const mfa = await getMfaCredentials(userId)
  const codes: string[] = mfa.backup_codes

  for (let i = 0; i < codes.length; i++) {
    if (await bcrypt.compare(inputCode, codes[i])) {
      // Remove used code
      codes.splice(i, 1)
      await updateBackupCodes(userId, codes)
      return true
    }
  }
  return false
}
```

---

## Login Flow with MFA

```
Step 1: POST /v1/app/auth/login (or /v1/web/auth/login)
    → Validate email + password
    → Check if user has MFA enabled (mfa_credentials.enabled_at IS NOT NULL)
    → If NO MFA: issue access_token + refresh_token as normal
    → If MFA required:
        Issue intermediate "mfa_pending" token (scoped to only /auth/mfa/validate):
        { jti, sub, scope: 'mfa_pending', exp: +5 minutes }
        Return: { mfa_required: true, mfa_token: "<interim_token>" }

Step 2: POST /v1/web/auth/mfa/validate
    Headers: Authorization: Bearer <mfa_token>
    Body: { code: "123456" }  OR  { backup_code: "X4K2-M9P7" }

    → Verify mfa_token scope = 'mfa_pending'
    → Verify TOTP code OR backup code
    → If valid: issue real access_token + refresh_token
    → If invalid: 401 (rate limited: 5 attempts per mfa_token)
    → mfa_token consumed (blacklisted in Redis after use)
```

---

## MFA Enforcement Middleware

```typescript
async function requireMfa(request, reply, next) {
  const user = request.user

  // Check if user has MFA set up
  const mfaCredential = await getMfaCredentials(user.id)

  // Super admin always requires MFA
  if (user.role === 'super_admin' && !mfaCredential?.enabled_at) {
    return reply.code(403).send({
      code: 'MFA_SETUP_REQUIRED',
      message: 'Super admin accounts require MFA. Set it up at /settings/security.',
      setup_url: '/web/auth/mfa/setup',
    })
  }

  // Org admin: check org policy
  if (user.role === 'org_admin') {
    const settings = await getOrgSettings(user.org_id)
    if (settings.mfa_required_for_admins && !mfaCredential?.enabled_at) {
      return reply.code(403).send({
        code: 'MFA_REQUIRED_BY_ORG',
        message: 'Your organization requires MFA for admin accounts.',
        setup_url: '/web/auth/mfa/setup',
      })
    }
  }

  next()
}
```

---

## MFA Recovery (Account Locked Out)

```
If user loses authenticator AND backup codes:
    → Contact super admin (for org admins)
    → Super admin calls: DELETE /v1/super-admin/users/:id/mfa
    → This disables MFA, forces user to re-set up on next login
    → Action is audit logged

For super admin locked out:
    → Manual DB intervention required (documented in runbook)
    → Requires 2-person authorization from infrastructure team
```

---

## Endpoints

| Method | Endpoint                                   | Description                                 |
| ------ | ------------------------------------------ | ------------------------------------------- |
| GET    | `/v1/web/auth/mfa/status`                  | Check if MFA is enabled for current user    |
| POST   | `/v1/web/auth/mfa/setup`                   | Generate TOTP secret + QR code              |
| POST   | `/v1/web/auth/mfa/verify-setup`            | Confirm setup with first TOTP code          |
| POST   | `/v1/web/auth/mfa/validate`                | Submit TOTP code after password login       |
| POST   | `/v1/web/auth/mfa/disable`                 | Disable MFA (requires TOTP confirmation)    |
| GET    | `/v1/web/auth/mfa/backup-codes`            | View remaining backup code count            |
| POST   | `/v1/web/auth/mfa/backup-codes/regenerate` | Regenerate all backup codes (requires TOTP) |
| DELETE | `/v1/super-admin/users/:id/mfa`            | Admin reset MFA for locked-out user         |
