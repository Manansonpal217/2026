# App Module 11 — Employee Privacy Portal (GDPR Data Subject Rights)

**Platform:** Desktop App (Electron + React) + Web Employee Portal  
**Depends on:** Backend Module 06 (Sessions), Backend Module 07 (Screenshots), Backend Module 08 (Activity Logs)

---

## Overview

Employees have legal rights to their own data (GDPR Articles 15, 17, 20). This module provides:
- **Article 15 (Right to Access):** View all data collected about them
- **Article 17 (Right to Erasure):** Request deletion of their data
- **Article 20 (Data Portability):** Export all data as JSON/CSV
- **Consent management:** View and withdraw consent

This screen is accessible from Settings in the desktop app AND from the employee web portal.

---

## Desktop App: Settings → Privacy Screen

```
┌──────────────────────────────────────────────────────────┐
│  ← Settings          Privacy & My Data                  │
│                                                          │
│  WHAT IS BEING TRACKED RIGHT NOW                         │
│  ─────────────────────────────────────────────────────── │
│  ✅ Session duration + task names                        │
│  ✅ Screenshots every 10 min (you can delete within 60s) │
│  ✅ Keyboard event count (NOT content)                   │
│  ✅ Mouse movement + click count                         │
│  ✅ Active application name                              │
│  ❌ URLs visited (disabled by your org)                  │
│                                                          │
│  Consent given: Mar 4, 2026 — Policy v2.1               │
│  [View consent history]                                  │
│                                                          │
│  MY DATA                                                 │
│  ─────────────────────────────────────────────────────── │
│  [📥 Export My Data (JSON)]                              │
│  [📥 Export My Data (CSV)]                               │
│                                                          │
│  DATA DELETION                                           │
│  ─────────────────────────────────────────────────────── │
│  [🗑️ Request Data Deletion]                             │
│  Warning: This will delete all your sessions,            │
│  screenshots, and activity logs permanently.             │
│  Your account will be deactivated.                       │
│                                                          │
│  CONSENT                                                 │
│  ─────────────────────────────────────────────────────── │
│  [Withdraw Consent]                                      │
│  Note: Withdrawing consent stops all tracking and        │
│  logs you out. Your org admin will be notified.          │
└──────────────────────────────────────────────────────────┘
```

---

## Data Export (Article 20 — Portability)

### JSON Export

```typescript
GET /v1/app/my-data/export?format=json

Response: zip file containing:
  - me.json           → user profile, consent history
  - sessions.json     → all time sessions
  - screenshots.json  → list of all screenshots (no image files, just metadata)
  - activity_logs.json → all activity records
  - consent_history.json → all consent records

// Implementation:
async function exportMyData(userId: string, format: 'json' | 'csv'): Promise<Buffer> {
  const [user, sessions, screenshots, activityLogs, consents] = await Promise.all([
    getUserWithConsents(userId),
    getAllSessions(userId),
    getAllScreenshotMetadata(userId),   // metadata only, not image files
    getAllActivityLogs(userId),
    getUserConsents(userId),
  ])

  if (format === 'json') {
    return createZip({
      'me.json': JSON.stringify({ user, consents }, null, 2),
      'sessions.json': JSON.stringify(sessions, null, 2),
      'screenshots.json': JSON.stringify(screenshots, null, 2),
      'activity_logs.json': JSON.stringify(activityLogs, null, 2),
    })
  }

  // CSV: separate files per data type, flat structure
  return createCsvZip({ user, sessions, screenshots, activityLogs })
}
```

---

## Data Deletion Request (Article 17 — Erasure)

```typescript
POST /v1/app/my-data/delete-request
Body: { reason?: string }

Action:
  1. Create deletion_requests row:
     { user_id, requested_at, status: 'pending', reason }
  2. Notify org admin via email:
     "Employee John Doe has requested deletion of their TrackSync data."
  3. Notify super admin (for compliance tracking)
  4. User's account status → 'deletion_pending'
  5. Return: { ticket_id, expected_completion: "within 30 days" }

Processing (within 30 days per GDPR):
  6. Org admin acknowledges (or auto-proceeds after 7 days if org admin doesn't respond)
  7. BullMQ job: purge user data
     - DELETE time_sessions WHERE user_id = :id
     - DELETE screenshots WHERE user_id = :id (+ S3 objects)
     - DELETE activity_logs WHERE user_id = :id
     - DELETE user_consents WHERE user_id = :id
     - Anonymize (don't delete) audit_log entries: actor_id → 'DELETED_USER'
     - DELETE users row (soft delete: status = 'deleted', PII fields nulled)
  8. Confirmation email sent to user
```

```sql
deletion_requests
  id            UUID PRIMARY KEY
  user_id       UUID FK → users
  requested_at  TIMESTAMP
  reason        TEXT
  status        ENUM(pending, processing, completed, rejected)
  completed_at  TIMESTAMP
  rejection_reason TEXT
  processed_by  UUID FK → users   -- admin who processed it
```

---

## Consent Withdrawal

```typescript
POST /v1/app/my-consent/withdraw

Action:
  1. UPDATE user_consents SET withdrawn_at = NOW() WHERE user_id = :id AND withdrawn_at IS NULL
  2. Immediately stop all tracking on desktop (emit local event)
  3. Revoke all tokens → force logout
  4. Notify org admin: "John Doe has withdrawn consent for tracking"
  5. Account becomes non-trackable (can still log in but cannot track time)
```

---

## View My Own Screenshots

Employees can view their own screenshots before they disappear into the admin panel:

```
GET /v1/app/my-screenshots?date=2026-03-04

Response: [{
  id, captured_at, activity_score,
  thumbnail_url,           ← signed URL, 1h expiry
  delete_window_expires,   ← NULL if past grace period
  is_deleted
}]
```

```
GET /v1/app/my-screenshots/:id/view
Response: { url: <full-size signed URL, 1h expiry> }
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/app/my-data/export?format=json\|csv` | Export all own data |
| POST | `/v1/app/my-data/delete-request` | Request account + data deletion |
| GET | `/v1/app/my-data/delete-request/status` | Check deletion request status |
| POST | `/v1/app/my-consent/withdraw` | Withdraw tracking consent |
| GET | `/v1/app/my-consent/history` | View all consent events |
| POST | `/v1/app/consent` | Record new consent |
| GET | `/v1/app/my-screenshots` | View own screenshot metadata |
| GET | `/v1/app/my-screenshots/:id/view` | Get signed URL for own screenshot |
| GET | `/v1/app/my-sessions` | View own session history |
