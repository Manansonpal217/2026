# Backend Module 04 — Feature Flags & Settings

**Stack:** Node.js + Fastify + Prisma + PostgreSQL + Redis + Socket.io  
**Used by:** Super Admin Panel, Desktop App (reads), Backend Module 10 (WebSocket push)

---

## Overview

Manages per-organization feature flags. Super Admin controls all flags. Changes take effect in real-time on all connected desktop apps via WebSocket push. Settings are cached in Redis for fast reads.

---

## Database Table

```sql
org_settings
  id                            UUID PRIMARY KEY
  org_id                        UUID FK → organizations

  -- Screenshot Settings
  screenshots_enabled           BOOLEAN DEFAULT true
  screenshot_interval           INT DEFAULT 10       -- minutes
  screenshot_blur               BOOLEAN DEFAULT false
  screenshot_user_delete_window INT DEFAULT 60       -- seconds

  -- Activity Tracking
  activity_tracking_enabled     BOOLEAN DEFAULT true
  track_keyboard                BOOLEAN DEFAULT true
  track_mouse                   BOOLEAN DEFAULT true
  track_app_usage               BOOLEAN DEFAULT true
  track_url                     BOOLEAN DEFAULT false

  -- App Behavior
  idle_detection_enabled        BOOLEAN DEFAULT true
  idle_timeout_minutes          INT DEFAULT 5
  offline_tracking_enabled      BOOLEAN DEFAULT true
  force_task_selection          BOOLEAN DEFAULT true

  -- Billing
  billing_cutoff_auto           BOOLEAN DEFAULT true

  updated_at                    TIMESTAMP
  updated_by                    UUID FK → users
```

---

## Endpoints

### Super Admin: Get Org Settings
```typescript
GET /super-admin/orgs/:id/settings

Response: { ...all org_settings fields }
```

### Super Admin: Update Org Settings
```typescript
PATCH /super-admin/orgs/:id/settings
Body: { screenshots_enabled?, screenshot_interval?, ... }

Action:
  1. Validate values (e.g., interval must be in [5, 10, 15, 30])
  2. Update org_settings row
  3. Invalidate Redis cache for this org
  4. Create audit_log entry (before/after values)
  5. Push to all connected desktop clients via WebSocket:
     { event: 'settings:updated', orgId, settings: { ...changed fields } }

Response: { settings: { ...updated } }
```

### Super Admin: Get Global Defaults (for new orgs)
```typescript
GET /super-admin/settings/defaults
PATCH /super-admin/settings/defaults
Body: { ...any default settings }
```

### App: Get Org Settings (Desktop App reads this)
```typescript
GET /app/org-settings
Auth: employee JWT

Response: { ...org_settings for employee's org }

Implementation:
  1. Check Redis cache: GET org_settings:<org_id>
  2. If hit: return cached (TTL: 5 minutes)
  3. If miss: read from PostgreSQL, cache in Redis
```

---

## Redis Cache Strategy

```typescript
const SETTINGS_CACHE_KEY = (orgId: string) => `org_settings:${orgId}`
const SETTINGS_TTL = 300  // 5 minutes

async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const cached = await redis.get(SETTINGS_CACHE_KEY(orgId))
  if (cached) return JSON.parse(cached)

  const settings = await prisma.org_settings.findUnique({ where: { org_id: orgId } })
  await redis.setex(SETTINGS_CACHE_KEY(orgId), SETTINGS_TTL, JSON.stringify(settings))
  return settings
}

async function invalidateSettingsCache(orgId: string) {
  await redis.del(SETTINGS_CACHE_KEY(orgId))
}
```

---

## Real-Time Push Flow

```
Super Admin changes screenshot_interval for Acme Corp from 10 → 5:
    → PATCH /super-admin/orgs/acme-id/settings
       body: { screenshot_interval: 5 }
    → DB updated
    → Redis invalidated
    → Audit log created:
         action: 'setting.screenshot_interval_changed'
         before: { screenshot_interval: 10 }
         after:  { screenshot_interval: 5 }
    → io.to(`org:acme-id`).emit('settings:updated', { screenshot_interval: 5 })
    → All connected Acme Corp desktop apps receive the event
    → Each app calls applySettings() immediately
    → New screenshot interval takes effect without restart
```

---

## Validation Rules

| Setting | Valid Values |
|---------|-------------|
| `screenshot_interval` | 5, 10, 15, 30 (minutes) |
| `screenshot_user_delete_window` | 0–300 (seconds) |
| `idle_timeout_minutes` | 1–60 (minutes) |
| All booleans | true / false only |

---

## Default Settings on Org Creation

```typescript
async function createDefaultSettings(orgId: string, createdBy: string) {
  await prisma.org_settings.create({
    data: {
      org_id: orgId,
      screenshots_enabled: true,
      screenshot_interval: 10,
      screenshot_blur: false,
      screenshot_user_delete_window: 60,
      activity_tracking_enabled: true,
      track_keyboard: true,
      track_mouse: true,
      track_app_usage: true,
      track_url: false,
      idle_detection_enabled: true,
      idle_timeout_minutes: 5,
      offline_tracking_enabled: true,
      force_task_selection: true,
      billing_cutoff_auto: true,
      updated_by: createdBy
    }
  })
}
```

---

## Audit Logging

Every settings change creates an audit log:

```typescript
audit_logs row:
  actor_id    = super_admin_user_id
  org_id      = affected org
  action      = 'setting.screenshots_enabled_changed'
  before_value = { screenshots_enabled: true }
  after_value  = { screenshots_enabled: false }
  ip_address  = request.ip
```
