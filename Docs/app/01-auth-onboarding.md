# App Module 01 — Authentication & Onboarding

**Platform:** Desktop App (Electron + React)  
**Depends on:** Backend Module 01 (Auth/JWT), Backend Module 02 (Org Management)

---

## Overview

Handles employee login, organization auto-detection, secure token storage, and first-launch onboarding (including platform permissions). This is the entry point of the desktop app.

---

## Screens

### Login Screen
- Email + password fields
- "Sign in with Google" and "Sign in with Microsoft" (SSO) buttons
- Organization auto-detected from email domain (no manual org entry needed)
- Error states: invalid credentials, org suspended, account inactive

### Onboarding / First Launch
- Welcome screen with a brief "what will be tracked" consent notice
- Permission request flow (macOS: Screen Recording, Accessibility for keyboard/mouse tracking)
- App configured and ready state

---

## Flows

### Standard Login
```
User enters email + password
    → POST /app/auth/login
    → Response: { access_token, refresh_token, user, org_settings }
    → access_token stored in OS keychain (keytar — macOS Keychain / Windows Credential Manager)
    → refresh_token stored in OS keychain
    → user + org cached in local SQLite (settings cache)
    → Navigate to Project Selector screen
```

### SSO (Google / Microsoft)
```
User clicks "Sign in with Google"
    → Open system browser to /app/auth/sso/google
    → User authenticates on Google
    → Backend callback receives code → exchanges for tokens → creates session
    → Backend redirects to tracksync://auth/callback?token=<desktop_token>
    → Electron deep-link handler receives token (registered via `app.setAsDefaultProtocolClient('tracksync')`)
    → Token stored in OS keychain
    → Navigate to Project Selector
```

### Token Refresh
```
Every API call checks if access_token is within 5 min of expiry
    → If so: POST /app/auth/refresh { refresh_token }
    → New access_token stored in keychain (replaces old)
    → If refresh fails (token revoked / org suspended) → force logout
```

### Logout
```
User clicks logout (from settings/tray menu)
    → POST /app/auth/logout
    → All tokens cleared from keychain
    → Local SQLite cache cleared (except completed+synced sessions)
    → Navigate to Login screen
```

---

## Local Storage (SQLite)

```sql
auth_cache
  user_id         TEXT
  org_id          TEXT
  email           TEXT
  name            TEXT
  role            TEXT
  org_name        TEXT
  org_status      TEXT    -- active | suspended
  token_expires_at INTEGER  -- Unix timestamp, for local refresh check
  cached_at       INTEGER
```

> Tokens themselves are NEVER stored in SQLite — only in the OS keychain.

---

## Consent Gate (GDPR / Employee Monitoring Laws)

> **Legal requirement:** Before any tracking begins, employees must give informed, specific, and freely given consent. This must be recorded with a timestamp and policy version. Consent must be re-requested if tracking settings change materially (e.g., screenshots are enabled for an org that previously had them off).

### Consent Screen (First Launch + Anytime Settings Change)

```
┌──────────────────────────────────────────────────────────┐
│  TrackSync — What We Track                               │
│                                                          │
│  Your organization (Acme Corp) has configured TrackSync  │
│  to collect the following data while you are tracking:   │
│                                                          │
│  ✅ Session duration (start/stop time, task name)        │
│  ✅ Screenshots every 10 minutes                         │
│      You can delete each screenshot within 60 seconds    │
│  ✅ Keyboard event COUNT (not what you type)             │
│  ✅ Mouse movement distance and click count              │
│  ✅ Active application name                              │
│  ❌ URLs visited (disabled by your org)                  │
│  ❌ Screen content reading (never)                       │
│  ❌ Keystroke logging (never)                            │
│                                                          │
│  This data is visible to your Org Admin and Managers.    │
│  You can view your own data anytime in Settings >        │
│  Privacy, and request deletion at any time.              │
│                                                          │
│  Privacy Policy v2.1 | Data Processing Agreement        │
│                                                          │
│  [Decline — I cannot use TrackSync]                      │
│  [I Understand & Consent]                               │
└──────────────────────────────────────────────────────────┘
```

### Consent Recording

```typescript
// After employee clicks [I Understand & Consent]:
async function recordConsent(userId: string, orgSettings: OrgSettings) {
  await api.post('/v1/app/consent', {
    consent_type: 'employee_monitoring',
    policy_version: CURRENT_POLICY_VERSION,  // e.g., "2.1"
    tracking_config_hash: hashTrackingConfig(orgSettings),  // records exactly what was consented to
    consented_at: new Date().toISOString(),
  })

  // Store locally so app can detect if settings changed since last consent
  db.run(`
    INSERT OR REPLACE INTO consent_state (key, value) VALUES
    ('last_consent_config_hash', ?),
    ('last_consent_at', ?)
  `, [hashTrackingConfig(orgSettings), Date.now()])
}
```

### Re-Consent Trigger

```typescript
// Called on every app launch after settings sync
function checkIfReConsentRequired(currentSettings: OrgSettings): boolean {
  const lastHash = db.get("SELECT value FROM consent_state WHERE key = 'last_consent_config_hash'")

  // If tracking settings changed materially, require re-consent
  const currentHash = hashTrackingConfig(currentSettings)
  if (lastHash?.value !== currentHash) {
    return true  // show consent screen again
  }
  return false
}

// "Material change" = screenshots newly enabled, URL tracking enabled, interval reduced
function hashTrackingConfig(s: OrgSettings): string {
  const key = [
    s.screenshots_enabled, s.screenshot_interval,
    s.activity_tracking_enabled, s.track_url,
    s.track_keyboard, s.track_mouse, s.track_app_usage
  ].join('|')
  return crypto.createHash('sha256').update(key).digest('hex')
}
```

### Decline Handling

If employee declines:
- App shows: "You cannot use TrackSync without consenting to your organization's tracking policy. Please contact your admin if you have questions."
- App logs out and closes
- Backend receives no tracking data (no consent = no tracking)

---

## macOS Permission Flow

```
First launch on macOS:
    1. Check if screenshots_enabled = true in org_settings
       - If false: skip screen recording permission request entirely
    2. If screenshots required:
       → Show in-app guide: "TrackSync needs Screen Recording permission"
       → Button: [Open System Settings] [Skip]
       → User enables in System Settings → Privacy → Screen Recording
       → App polls for permission every 2 seconds (max 60s)
       → On grant: enable screenshot module
    3. If activity tracking enabled:
       → Request Accessibility permission (for keyboard/mouse count)
       → Same guide + polling pattern
```

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Tokens never in plain files | `keytar` npm → OS keychain (Keychain / Credential Manager / libsecret) |
| Short-lived access token | 15-minute expiry |
| Refresh token rotation | New refresh token issued on every refresh call |
| Org suspension check | Every API response may return 402 → force lock screen |
| Logout on revoke | 401 on any call → clear tokens, navigate to login |

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/app/auth/login` | Email/password login |
| GET | `/app/auth/sso/:provider` | Initiate SSO flow |
| POST | `/app/auth/refresh` | Refresh access token |
| POST | `/app/auth/logout` | Invalidate session |
| GET | `/app/me` | Fetch current user + org info |
