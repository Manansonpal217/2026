# TrackSync — Complete SaaS Product Plan
> Time Tracking + Project Integration + Employee Monitoring Platform

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Role Hierarchy](#2-role-hierarchy)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Database Schema](#5-database-schema)
6. [Dynamic Integration System](#6-dynamic-integration-system)
7. [Billing Cutoff System](#7-billing-cutoff-system)
8. [Feature Flag System](#8-feature-flag-system)
9. [Activity Measurement System](#9-activity-measurement-system)
10. [Making the App Super Light](#10-making-the-app-super-light)
11. [Cross-Platform Strategy](#11-cross-platform-strategy)
12. [Desktop App — Screen by Screen](#12-desktop-app--screen-by-screen)
13. [Admin Panel Architecture](#13-admin-panel-architecture)
14. [Complete Data Flow](#14-complete-data-flow)
15. [Subscription & Billing Model](#15-subscription--billing-model)
16. [Security Checklist](#16-security-checklist)
17. [Development Roadmap](#17-development-roadmap)
18. [Team Structure](#18-team-structure)
19. [Go-to-Market Strategy](#19-go-to-market-strategy)
20. [Key Challenges](#20-key-challenges)

---

## 1. Product Overview

**Product Name:** TrackSync  
**Type:** Desktop App (Mac/Windows/Linux) + Web Admin Panel  
**Model:** B2B SaaS — charge organizations per seat  

### What It Does

- Employees log in on a desktop app and see all their assigned tasks from their company's project tool (Jira, Asana, Linear, etc.)
- They select a task and start a timer — the app tracks their time, captures screenshots at set intervals, and measures activity
- When done, they log the work back into the same tool (or Google Sheets, etc.)
- All data is visible to Org Admins, Managers, and Super Admin in a web dashboard
- Super Admin (you) controls all settings, billing, and feature flags per organization

---

## 2. Role Hierarchy

```
┌─────────────────────────────────────────┐
│           SUPER ADMIN (You)             │
│  - Manage all orgs                      │
│  - Enable/disable features per org      │
│  - Cut off access (billing)             │
│  - Add new integrations globally        │
│  - Change SS interval per org           │
│  - View everything                      │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│         ORG ADMIN (1 per org)           │
│  - Manage their org users               │
│  - Connect org-level integration        │
│  - View org reports & screenshots       │
│  - Manage managers & employees          │
│  - Cannot change feature flags          │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│      MANAGER (Multiple per org)         │
│  - View their team's time & activity    │
│  - Assign projects to team members      │
│  - View team reports                    │
│  - Cannot see other teams               │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│         EMPLOYEE (End user)             │
│  - Uses desktop app only                │
│  - Tracks time on assigned tasks        │
│  - Views own logs                       │
└─────────────────────────────────────────┘
```

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  SYSTEM ARCHITECTURE                 │
├─────────────────┬───────────────────┬───────────────┤
│   Desktop App      │    Backend API    │   Web Panel   │
│ (Electron + React) │ (Node/Fastify/TS) │  (Next.js)    │
├─────────────────┼───────────────────┼───────────────┤
│ - Auth          │ - REST API        │ - Super Admin │
│ - Project List  │ - WebSockets      │ - Org Admin   │
│ - Time Tracking │ - OAuth Handlers  │ - Manager     │
│ - Screenshots   │ - Screenshot Store│ - Reports     │
│ - Activity Log  │ - Billing Logic   │ - Billing     │
│ - Log Work      │ - Integration Eng │ - User Mgmt   │
│ - Offline SQLite│ - Feature Flags   │ - Settings    │
└─────────────────┴───────────────────┴───────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │        DATABASE            │
              │  PostgreSQL + Redis +      │
              │  S3 (screenshots) +        │
              │  SQLite (local/desktop)    │
              └────────────────────────────┘
```

---

## 4. Tech Stack

### Desktop App
| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | **Electron 32+** | Mature ecosystem, Node.js in main process, excellent cross-platform support |
| Frontend | React + Vite | Fast builds, small output |
| UI | TailwindCSS | Purges unused CSS → small bundles |
| State | Zustand | Tiny, no boilerplate |
| Local DB | `better-sqlite3` (in main process) | Synchronous, fast, full WAL mode support |
| IPC | `ipcMain` / `ipcRenderer` | Secure, context-isolated main ↔ renderer communication |
| Keychain | `keytar` | Cross-platform keychain access (macOS Keychain, Windows Credential Manager, libsecret on Linux) |
| Screenshots | `screenshot-desktop` | Cross-platform screen capture npm package |
| Auto-update | `electron-updater` | Part of electron-builder, signed delta updates |
| Real-time | WebSocket (`ws` via Node.js) | Settings push from server |

### Backend API
| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js + Fastify | Faster than Express |
| Language | TypeScript | Type safety across the board |
| ORM | Prisma | Type-safe, easy migrations |
| Primary DB | PostgreSQL | Relational, reliable |
| Cache | Redis | Sessions, settings cache, queues |
| Queue | BullMQ | Screenshot processing, sync jobs |
| Real-time | Socket.io | Push settings to desktop apps |

### Web Admin Panel
| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| UI | TailwindCSS + shadcn/ui |
| Charts | Recharts / Tremor |
| State | React Query |
| Auth | NextAuth.js |

### Infrastructure
| Service | Tool |
|---------|------|
| Cloud | AWS |
| File Storage | S3 + CloudFront CDN (signed URLs, per-org prefix) |
| DB Hosting | RDS PostgreSQL 15 (Multi-AZ), Read Replica for reports |
| DB Connection Pooling | **RDS Proxy** (managed PgBouncer equivalent) — required before 5+ ECS instances |
| Cache / Queues | ElastiCache Redis (cluster mode) |
| App Hosting | ECS Fargate (auto-scales, 0→N instances) |
| CI/CD | GitHub Actions |
| Desktop Builds | **electron-builder** + GitHub Actions (macOS Universal, Windows x64, Linux AppImage/deb) |
| Secret Management | **AWS Secrets Manager** — DB credentials, Stripe keys, AES/KMS keys |
| Monitoring | OpenTelemetry → Datadog APM + Sentry (errors) |
| Email | Resend / Postmark |
| Billing | Stripe |
| Tracing | OpenTelemetry SDK (correlation IDs across all services) |

### DB Connection Pooling — RDS Proxy

> PostgreSQL has a hard limit on connections (~100 on db.t3.micro, ~5000 on db.r5.4xlarge). Each ECS Fargate task opens its own connection pool (e.g., 10 connections). At 5 tasks, that's 50 connections. RDS Proxy acts as a managed connection pooler, multiplexing thousands of connections to a small RDS pool.

```
ECS Tasks (N instances × 10 connections each)
        ↓
    RDS Proxy  ← connection pool (maintains 10–50 connections to RDS)
        ↓
    RDS PostgreSQL (Multi-AZ)
        ↓
    RDS Read Replica  ← reporting queries only (GET /admin/reports/*)
```

Configuration:
- Proxy endpoint: `tracksync-proxy.proxy-xxx.us-east-1.rds.amazonaws.com`
- Max connections per DB user: 100 on proxy
- IAM authentication to proxy (no DB password in env vars — uses AWS IAM token)
- Read replica endpoint configured separately in reporting service

### RDS Read Replica

All write operations (`INSERT`, `UPDATE`, `DELETE`) go to the primary RDS instance. All read-heavy reporting queries go to the Read Replica:

```typescript
// db.ts — two separate Prisma clients
export const dbWrite = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }  // primary (via RDS Proxy)
})

export const dbRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL } }  // read replica
})

// Usage:
// All session writes: dbWrite.timeSession.create(...)
// All reports: dbRead.timeSession.findMany(...)  ← doesn't load primary
```

---

## 5. Database Schema

### Organizations

```sql
organizations
  id                     UUID PRIMARY KEY
  name                   VARCHAR
  slug                   VARCHAR UNIQUE        -- acme-corp
  status                 ENUM(active, suspended, cancelled, trial, trial_expired)
                                               -- trial_expired: trial ended, no payment yet
  billing_status         ENUM(paid, overdue, failed, cancelled)
  suspended_at           TIMESTAMP
  suspension_reason      TEXT
  plan                   ENUM(starter, growth, business, enterprise)
  seats_total            INT
  seats_used             INT
  trial_ends_at          TIMESTAMP
  data_region            VARCHAR DEFAULT 'us-east-1'
                                               -- 'us-east-1' | 'eu-west-1' | 'ap-southeast-1'
                                               -- All data (DB + S3) stored in this region
  stripe_customer_id     VARCHAR
  stripe_subscription_id VARCHAR
  created_at             TIMESTAMP
  updated_at             TIMESTAMP
```

### Organization Feature Flags (Super Admin Controls This)

```sql
org_settings
  id                           UUID PRIMARY KEY
  org_id                       UUID FK → organizations

  -- Screenshot Settings
  screenshots_enabled          BOOLEAN DEFAULT true
  screenshot_interval          INT DEFAULT 10       -- minutes (5, 10, 15, 30)
  screenshot_blur              BOOLEAN DEFAULT false
  screenshot_user_delete_window INT DEFAULT 60      -- seconds grace period
  screenshot_retention_days    INT DEFAULT 365      -- days before S3 Glacier transition
                                                    -- configurable for GDPR compliance

  -- Activity Tracking
  activity_tracking_enabled    BOOLEAN DEFAULT true
  track_keyboard               BOOLEAN DEFAULT true
  track_mouse                  BOOLEAN DEFAULT true
  track_app_usage              BOOLEAN DEFAULT true
  track_url                    BOOLEAN DEFAULT false

  -- Activity Score Weights (configurable per org)
  activity_weight_keyboard     FLOAT DEFAULT 0.4   -- keyboard events weight
  activity_weight_mouse        FLOAT DEFAULT 0.3   -- mouse events weight
  activity_weight_movement     FLOAT DEFAULT 0.3   -- mouse distance weight

  -- App Behavior
  idle_detection_enabled       BOOLEAN DEFAULT true
  idle_timeout_minutes         INT DEFAULT 5
  offline_tracking_enabled     BOOLEAN DEFAULT true
  force_task_selection         BOOLEAN DEFAULT true

  -- Time Approval
  time_approval_required       BOOLEAN DEFAULT false  -- manager must approve sessions

  -- MFA Policy
  mfa_required_for_admins      BOOLEAN DEFAULT false
  mfa_required_for_managers    BOOLEAN DEFAULT false

  -- Billing
  billing_cutoff_auto          BOOLEAN DEFAULT true

  updated_at                   TIMESTAMP
  updated_by                   UUID FK → users
```

### Users

```sql
users
  id             UUID PRIMARY KEY
  org_id         UUID FK → organizations
  email          VARCHAR
  name           VARCHAR
  avatar_url     VARCHAR
  role           ENUM(super_admin, org_admin, manager, employee)
  manager_id     UUID FK → users
  status         ENUM(active, inactive, suspended, deletion_pending, deleted)
  timezone       VARCHAR DEFAULT 'UTC'    -- IANA timezone: 'America/New_York', 'Europe/Berlin'
  last_active_at TIMESTAMP
  desktop_token  VARCHAR
  created_at     TIMESTAMP
  updated_at     TIMESTAMP

  -- Composite unique: same email allowed in different orgs (e.g., consultants)
  UNIQUE(email, org_id)
```

### Integration Definitions (You Add New Tools Here)

```sql
integration_definitions
  id                UUID PRIMARY KEY
  name              VARCHAR              -- "Jira", "Asana", "Linear"
  slug              VARCHAR UNIQUE       -- "jira", "asana", "linear"
  logo_url          VARCHAR
  auth_type         ENUM(oauth2, api_key, basic_auth, pat)
  is_active         BOOLEAN
  supports_projects BOOLEAN
  supports_tasks    BOOLEAN
  supports_time_log BOOLEAN
  supports_webhooks BOOLEAN
  config_schema     JSONB                -- what fields are needed
  created_at        TIMESTAMP
```

### Org Integration Connection (Org Admin Provides Creds Once)

```sql
org_integrations
  id                 UUID PRIMARY KEY
  org_id             UUID FK → organizations
  integration_def_id UUID FK → integration_definitions
  auth_data          JSONB ENCRYPTED      -- tokens, api keys, domain
  extra_config       JSONB                -- e.g., Jira domain, project filters
  status             ENUM(connected, disconnected, error)
  last_synced_at     TIMESTAMP
  error_message      TEXT
  connected_by       UUID FK → users
  created_at         TIMESTAMP
```

### Projects

```sql
projects
  id                UUID PRIMARY KEY
  org_id            UUID FK → organizations
  org_integration_id UUID FK → org_integrations
  external_id       VARCHAR
  name              VARCHAR
  description       TEXT
  status            VARCHAR
  metadata          JSONB
  last_synced_at    TIMESTAMP
```

### Tasks

```sql
tasks
  id                   UUID PRIMARY KEY
  project_id           UUID FK → projects
  org_id               UUID FK → organizations
  external_id          VARCHAR
  title                VARCHAR
  description          TEXT
  status               VARCHAR
  priority             VARCHAR
  assignee_external_id VARCHAR
  assignee_user_id     UUID FK → users
  external_url         VARCHAR
  due_date             DATE
  metadata             JSONB
  last_synced_at       TIMESTAMP
```

### Time Sessions

```sql
time_sessions
  id                UUID PRIMARY KEY
  user_id           UUID FK → users
  org_id            UUID FK → organizations
  task_id           UUID FK → tasks
  project_id        UUID FK → projects
  device_id         VARCHAR            -- stable device UUID from desktop app keychain
  device_name       VARCHAR            -- e.g., "John's MacBook Pro"
  started_at        TIMESTAMP
  ended_at          TIMESTAMP
  duration_seconds  INT
  is_manual         BOOLEAN DEFAULT false
  is_idle_excluded  BOOLEAN
  idle_seconds      INT DEFAULT 0
  notes             TEXT
  status            ENUM(active, paused, completed, discarded)
  approval_status   ENUM(not_required, pending, approved, rejected) DEFAULT 'not_required'
  approved_by       UUID FK → users    -- manager who approved
  approved_at       TIMESTAMP
  logged_externally BOOLEAN DEFAULT false
  admin_adjusted    BOOLEAN DEFAULT false   -- true if admin edited this session
  updated_at        TIMESTAMP

  -- Deduplication key: same device cannot have two sessions starting at same second
  UNIQUE(user_id, device_id, started_at)
```

### Screenshots

```sql
screenshots
  id                     UUID PRIMARY KEY
  session_id             UUID FK → time_sessions
  user_id                UUID FK → users
  org_id                 UUID FK → organizations
  s3_key                 VARCHAR
  thumbnail_s3_key       VARCHAR
  captured_at            TIMESTAMP
  is_deleted             BOOLEAN DEFAULT false
  deleted_at             TIMESTAMP
  delete_window_expires  TIMESTAMP
  activity_score         INT               -- 0-100
  updated_at             TIMESTAMP

  -- Deduplication: same user cannot have two screenshots at the same second
  UNIQUE(user_id, captured_at)
```

### Activity Logs

```sql
activity_logs
  id               UUID PRIMARY KEY
  session_id       UUID FK → time_sessions
  user_id          UUID FK → users
  org_id           UUID FK → organizations
  recorded_at      TIMESTAMP
  interval_seconds INT
  keyboard_events  INT
  mouse_events     INT
  mouse_distance_px INT
  active_app       VARCHAR
  active_url       VARCHAR            -- stored encrypted (AES-256) if track_url = true
  activity_percent INT               -- 0-100 computed score

  -- Deduplication: one record per session per minute
  UNIQUE(session_id, recorded_at)
```

### Tasks (Updated)

```sql
tasks
  id                   UUID PRIMARY KEY
  project_id           UUID FK → projects
  org_id               UUID FK → organizations
  external_id          VARCHAR
  title                VARCHAR
  description          TEXT
  status               VARCHAR
  priority             VARCHAR
  assignee_external_id VARCHAR
  assignee_user_id     UUID FK → users
  external_url         VARCHAR
  due_date             DATE
  metadata             JSONB
  last_synced_at       TIMESTAMP
  updated_at           TIMESTAMP        -- required for delta sync
```

### Projects (Updated)

```sql
projects
  id                UUID PRIMARY KEY
  org_id            UUID FK → organizations
  org_integration_id UUID FK → org_integrations
  external_id       VARCHAR
  name              VARCHAR
  description       TEXT
  status            VARCHAR
  budget_hours      INT                -- NULL = no budget; alerts at 80% + 100%
  metadata          JSONB
  last_synced_at    TIMESTAMP
  updated_at        TIMESTAMP          -- required for delta sync
```

### Required Database Indexes

```sql
-- Critical for performance — must be created on migration:

-- Activity heatmap queries (GROUP BY date/hour for a user)
CREATE INDEX idx_activity_logs_user_recorded ON activity_logs(user_id, recorded_at);

-- Screenshot browser (filter by user + date range)
CREATE INDEX idx_screenshots_user_captured ON screenshots(user_id, captured_at);
CREATE INDEX idx_screenshots_org_captured ON screenshots(org_id, captured_at);

-- Org-level time reports
CREATE INDEX idx_sessions_org_started ON time_sessions(org_id, started_at);

-- Active session check (on every app launch)
CREATE INDEX idx_sessions_user_status ON time_sessions(user_id, status);

-- Tasks: "my tasks" query on desktop app
CREATE INDEX idx_tasks_assignee ON tasks(assignee_user_id);

-- Sync: find changed records since last sync
CREATE INDEX idx_tasks_updated ON tasks(org_id, updated_at);
CREATE INDEX idx_projects_updated ON projects(org_id, updated_at);

-- Org integrations lookup
CREATE INDEX idx_org_integrations_org ON org_integrations(org_id);
```

### Work Log Exports

```sql
work_log_exports
  id              UUID PRIMARY KEY
  session_id      UUID FK → time_sessions
  user_id         UUID FK → users
  export_target   VARCHAR              -- "jira", "tempo", "google_sheets"
  external_id     VARCHAR
  duration_logged INT
  notes           TEXT
  status          ENUM(success, failed, pending)
  error_message   TEXT
  exported_at     TIMESTAMP
```

### Billing Events

```sql
billing_events
  id           UUID PRIMARY KEY
  org_id       UUID FK → organizations
  event_type   VARCHAR              -- payment_failed, suspended, reinstated
  triggered_by ENUM(stripe_webhook, super_admin, system)
  actor_id     UUID FK → users
  metadata     JSONB
  created_at   TIMESTAMP
```

### Audit Log

```sql
audit_logs
  id           UUID PRIMARY KEY
  actor_id     UUID FK → users
  org_id       UUID
  action       VARCHAR              -- "org.suspend", "setting.ss_disabled"
  before_value JSONB
  after_value  JSONB
  ip_address   VARCHAR
  created_at   TIMESTAMP
```

### User Consents (GDPR Compliance)

```sql
user_consents
  id                    UUID PRIMARY KEY
  user_id               UUID FK → users
  org_id                UUID FK → organizations
  consent_type          VARCHAR       -- 'employee_monitoring'
  policy_version        VARCHAR       -- e.g., '2.1' (semver of privacy policy)
  tracking_config_hash  VARCHAR       -- SHA-256 hash of the exact settings consented to
  consented_at          TIMESTAMP     -- when the employee clicked "I consent"
  withdrawn_at          TIMESTAMP     -- NULL until consent withdrawn
  ip_address            VARCHAR       -- employee's IP at consent time
  country_code          VARCHAR(2)    -- ISO 3166-1 alpha-2 (for jurisdiction-specific rules)
  created_at            TIMESTAMP
```

> Every time tracking settings change materially (screenshots enabled, URL tracking added, etc.), employees see the consent screen again before tracking resumes. A new `user_consents` row is created on each consent. Withdrawn consent stops all tracking immediately.

### Plan Features (Feature Gating by Plan)

```sql
-- Static config (not a DB table — defined in code as a const map)
-- Referenced here for documentation purposes

plan_features
  plan          ENUM(starter, growth, business, enterprise)
  feature       VARCHAR         -- 'multiple_integrations', 'audit_log_export', 'sso', 'api_access', 'pdf_reports'
  limit_value   INT             -- NULL = unlimited, INT = max count

-- Examples:
-- starter   | multiple_integrations | 1      ← only 1 integration
-- growth    | multiple_integrations | NULL   ← unlimited
-- starter   | pdf_reports           | 0      ← not available
-- business  | sso                   | NULL   ← available
-- business  | api_access            | NULL   ← available
```

---

## 6. Dynamic Integration System

> **Core Principle:** Each integration is a plugin that implements a standard interface. Add new integrations without touching core code — just drop a new folder.

### Folder Structure

```
/integrations
  /core
    base-integration.js       ← interface every plugin must implement
    integration-factory.js    ← loads correct plugin by slug
    sync-scheduler.js         ← runs sync jobs for all orgs
  /plugins
    /jira
      index.js
      auth.js
      projects.js
      tasks.js
      time-log.js
    /asana
      index.js
      auth.js
      projects.js
      tasks.js
    /linear
      index.js
      ...
    /github
      index.js
      ...
    /clickup
      ...                     ← just drop a new folder to add integration
```

### Base Integration Interface

```javascript
class BaseIntegration {

  // Validate credentials (called when org admin connects)
  async validateCredentials(authData) {}

  // Fetch all projects accessible with these creds
  async fetchProjects(authData, config) {}

  // Fetch tasks for a project
  async fetchTasks(authData, projectId, filters) {}

  // Fetch users from the tool (to map to your users)
  async fetchUsers(authData) {}

  // Log time to the tool
  async logWork(authData, payload) {}

  // Handle incoming webhook (optional)
  async handleWebhook(payload) {}

  // Return fields needed in UI
  static getConfigSchema() {}
}
```

### Adding a New Integration (Future)

```
1. Create /integrations/plugins/notion/index.js
2. Extend BaseIntegration, implement required methods
3. Insert row into integration_definitions table
4. Done — it appears in Super Admin panel automatically
```

### Integration Priority Roadmap

**Phase 1 (MVP)**
- Jira (Atlassian) — OAuth 2.0, REST API
- Asana — OAuth 2.0, REST API
- Google Sheets — work log export

**Phase 2**
- GitHub Issues
- Linear
- Trello
- Tempo (Jira time logging plugin)
- ClickUp

**Phase 3**
- Monday.com
- Azure DevOps
- Notion
- Basecamp

### How Org Admin Connects (OAuth Flow)

```
Org Admin clicks "Connect Jira"
    → Web panel opens OAuth flow
    → Admin authorizes on Jira
    → Callback hits your backend
    → Backend stores encrypted access_token + refresh_token
    → org_integrations row created
    → All employees in this org now use these shared credentials
    → Projects + tasks sync starts automatically
```

---

## 7. Billing Cutoff System

### Automatic (Stripe Webhook)

```
Stripe fires: invoice.payment_failed
    → Webhook handler receives it
    → Find org by stripe_customer_id
    → Set org.billing_status = 'failed'
    → If auto-cutoff enabled → org.status = 'suspended'
    → Set org.suspended_at = now()
    → All API calls for this org return 402
    → Desktop app shows "Account Suspended" screen
    → Email sent to org admin

Stripe fires: invoice.payment_succeeded
    → org.status = 'active'
    → org.billing_status = 'paid'
    → Access restored instantly
```

### Manual (Super Admin)

```
Super Admin clicks "Suspend Org"
    → PATCH /super-admin/orgs/:id/suspend
    → Body: { reason: "Non-payment", notify: true }
    → org.status = 'suspended'
    → billing_events row created
    → audit_logs row created
    → Email to org admin (optional)
    → All active desktop sessions terminated via WebSocket push
```

### Grace Period Flow

```
Day 0:  Payment fails → billing_status = 'overdue'
Day 1:  Warning email to org admin
Day 3:  Auto-suspend if still unpaid
        → org.status = 'suspended'
        → All desktop apps locked
Anytime: Admin pays → instantly restored
```

### Backend Middleware

```javascript
function checkOrgAccess(req, res, next) {
  const org = await getOrg(req.user.org_id)

  if (org.status === 'suspended') {
    return res.status(402).json({
      code: 'ORG_SUSPENDED',
      message: 'Your organization access has been suspended.',
      reason: org.suspension_reason
    })
  }
  next()
}
```

---

## 8. Feature Flag System

### How Flags Flow (Real-Time)

```
Super Admin toggles "Screenshots OFF" for Acme Corp
    → PATCH /super-admin/orgs/acme/settings
    → { screenshots_enabled: false }
    → org_settings row updated
    → WebSocket event pushed to all Acme Corp desktop sessions
    → Desktop app disables screenshot capture immediately
    → No app restart needed
    → Audit log created
```

### Desktop App Settings Sync

```javascript
// On app launch & every 5 minutes
async function syncOrgSettings() {
  const settings = await api.get('/app/org-settings')

  applySettings({
    screenshotsEnabled:  settings.screenshots_enabled,
    screenshotInterval:  settings.screenshot_interval * 60 * 1000,
    activityEnabled:     settings.activity_tracking_enabled,
    idleEnabled:         settings.idle_detection_enabled,
    idleTimeout:         settings.idle_timeout_minutes * 60 * 1000,
  })
}

// Real-time push — takes effect immediately
socket.on('settings:updated', (newSettings) => {
  applySettings(newSettings)
})
```

### Super Admin Settings Panel (Per Org)

| Setting | Type | Default |
|---------|------|---------|
| Screenshots Enabled | Toggle | ON |
| Screenshot Interval | Slider (5/10/15/30 min) | 10 min |
| Allow User Delete | Toggle + seconds | ON, 60s |
| Blur Screenshots | Toggle | OFF |
| Activity Tracking | Toggle | ON |
| Track Keyboard | Toggle | ON |
| Track Mouse | Toggle | ON |
| Track Active App | Toggle | ON |
| Track URLs Visited | Toggle | OFF |
| Idle Detection | Toggle + timeout | ON, 5 min |
| Force Task Selection | Toggle | ON |
| Auto-suspend on Payment Fail | Toggle | ON |

---

## 9. Activity Measurement System

### What Gets Measured (When Enabled)

Every 60 seconds, the desktop app records:
- Keyboard event count (not what was typed — only the count)
- Mouse click count
- Mouse movement distance in pixels
- Active application name
- Active window title (optional)
- Active URL (optional, if enabled by org)

### Activity Score Formula

> The formula uses **configurable, per-org weights** and **user-specific baselines** to prevent unfair scoring across different job types.

```typescript
// Weights: configurable in org_settings (activity_weight_keyboard/mouse/movement)
// Baselines: per-user 90th percentile from last 14 days (weekly recalculated)

score = min(100,
  normalize(keyboard_events, user_baseline.keyboard_p90) * org_settings.activity_weight_keyboard +
  normalize(mouse_events,    user_baseline.mouse_p90)    * org_settings.activity_weight_mouse +
  normalize(mouse_distance,  user_baseline.movement_p90) * org_settings.activity_weight_movement
) * 100

// Passive work boost: if active app is Zoom/Slack/Figma/browser and score < 40,
// apply a soft +30 boost (capped at 60%) to account for legitimate reading/meeting work.

session_activity = weighted_avg(activity_percent) over session intervals
                   (weighted by interval_seconds — longer intervals count more)
```

**Why normalize against own baseline?**  
A developer who types 80 events/min and a designer who types 20 events/min should both score well if they are at their typical pace. Scoring against a fixed denominator penalizes naturally quiet workers unfairly.

| Score | Color | Label |
|-------|-------|-------|
| 80–100 | 🟢 | High Activity |
| 50–79 | 🟡 | Moderate |
| 20–49 | 🟠 | Low |
| 0–19 | 🔴 | Very Low |

> Never label these "productive" / "unproductive" in the UI. They are activity signals only.

### How Activity Data Is Used

| Where | How |
|-------|-----|
| Per Screenshot | Activity score attached (green/yellow/red indicator) |
| Per Session | Overall productivity % + idle time subtracted |
| Per Day (User) | Activity heatmap, peak productivity hours |
| Per Day (Manager) | Team productivity overview |
| Reports | App usage breakdown, trends over time |

---

## 10. Local-First Data Strategy (SQLite → Cloud Sync)

> **Core Principle:** All time session data and screenshots are **first written to the local SQLite database on the user's machine**, then transferred to the main PostgreSQL + S3 backend. This ensures zero data loss during network outages and keeps the app fully functional offline.

### Why Local-First

- Employee tracks time in areas with unreliable internet (offices, cafes, travel)
- A network drop mid-session must never discard data
- Screenshots captured must be queued locally if upload fails
- Session integrity is the #1 product promise — local SQLite is the crash-safe buffer

### Local SQLite Schema (Desktop)

```sql
-- Stored on user's machine at: ~/.tracksync/local.db

local_sessions
  id                TEXT PRIMARY KEY   -- local UUID (same used when synced)
  server_session_id TEXT               -- NULL until synced
  task_id           TEXT
  project_id        TEXT
  started_at        INTEGER            -- Unix timestamp
  ended_at          INTEGER
  duration_seconds  INTEGER
  is_manual         INTEGER DEFAULT 0
  idle_seconds      INTEGER DEFAULT 0
  notes             TEXT
  status            TEXT               -- active | paused | completed | discarded
  sync_status       TEXT DEFAULT 'pending'  -- pending | synced | failed
  logged_externally INTEGER DEFAULT 0
  created_at        INTEGER

local_screenshots
  id                TEXT PRIMARY KEY   -- local UUID
  session_id        TEXT FK → local_sessions
  file_path         TEXT               -- absolute path on disk (temp location)
  captured_at       INTEGER            -- Unix timestamp
  activity_score    INTEGER
  sync_status       TEXT DEFAULT 'pending'  -- pending | uploading | synced | failed
  server_screenshot_id TEXT            -- NULL until synced
  retry_count       INTEGER DEFAULT 0
  last_attempt_at   INTEGER

local_activity_logs
  id                TEXT PRIMARY KEY
  session_id        TEXT FK → local_sessions
  recorded_at       INTEGER
  interval_seconds  INTEGER
  keyboard_events   INTEGER
  mouse_events      INTEGER
  mouse_distance_px INTEGER
  active_app        TEXT
  active_url        TEXT
  activity_percent  INTEGER
  sync_status       TEXT DEFAULT 'pending'
```

### Data Flow: Local → Server

```
[Employee starts timer]
    → local_sessions row created (sync_status = 'pending')
    → Timer ticks, activity recorded to local_activity_logs every 60s

[Screenshot interval fires]
    → Screenshot captured → saved to disk (temp file)
    → local_screenshots row created (sync_status = 'pending')
    → Background sync worker picks it up:
        If online:
            → Compress image → Upload to S3
            → POST /app/screenshots → server confirms
            → local_screenshots.sync_status = 'synced'
            → temp file deleted from disk
        If offline:
            → Stays in local_screenshots with sync_status = 'pending'
            → Retried when connection restores

[Employee stops session]
    → local_sessions.status = 'completed'
    → POST /app/sessions → server creates time_sessions row
    → local_sessions.server_session_id = <returned server ID>
    → local_sessions.sync_status = 'synced'

[App comes back online after offline period]
    → Sync worker scans local DB for all rows where sync_status = 'pending'
    → Replays them to server in chronological order
    → Handles conflicts (e.g., duplicate session detection by started_at)
    → Marks each row 'synced' on success, increments retry_count on failure
```

### Sync Worker Rules

| Rule | Detail |
|------|--------|
| Retry interval | Exponential backoff: 30s → 1m → 5m → 15m |
| Max retries | 10 attempts per record, then marked 'failed' and flagged |
| Order | Sessions synced before screenshots (foreign key dependency) |
| Conflict detection | Server deduplicates by (user_id + started_at) to prevent double entries |
| Screenshot cleanup | Local file deleted only after S3 confirms upload |
| Session integrity | Active session always written to SQLite first, even before any API call |

### What Stays Local Forever vs What Gets Synced

| Data | Local SQLite | Server (PostgreSQL / S3) |
|------|-------------|--------------------------|
| Active session (in-progress) | ✅ Always | Synced on complete |
| Completed sessions | ✅ Kept 30 days | ✅ Always |
| Screenshots | ✅ Until uploaded | ✅ S3 permanent |
| Activity logs | ✅ Until synced | ✅ Always |
| Cached projects/tasks | ✅ 15-min TTL | Source of truth |
| Settings | ✅ Cached | Source of truth |

---

## 11. Making the App Lightweight & Efficient

### Why Electron

Electron gives TrackSync access to the full Node.js ecosystem in the main process — this means `better-sqlite3`, `keytar`, `screenshot-desktop`, `electron-updater`, and native OS APIs without writing custom bindings. The developer ecosystem is mature, well-documented, and has long-term support.

### Electron Optimization Strategy

| Problem | Solution |
|---------|----------|
| High RAM (naive Electron) | Lazy-load renderers; keep main process lean; no preloaded heavy frames |
| Large bundle size | Tree-shaking with Vite; electron-builder compression (NSIS/DMG) |
| Slow startup | Preload only critical auth state; defer project list fetch |
| CPU usage | Timers use Node.js `setInterval` in main process (not renderer); activity polling is low-frequency |
| Memory leaks | All IPC listeners cleaned up on window close; sqlite connection closed on quit |

Target footprint: **~80–120 MB RAM** (typical Electron app at idle after optimizations — comparable to Slack, VS Code's minimal mode)

### Lightweight Design Principles

1. **Lean main process** — only SQLite, IPC handlers, tray, and background jobs live in main
2. **Lazy load screens** — React.lazy() for all routes; only load what user currently sees
3. **Local SQLite DB** — store sessions offline, sync when online
4. **Delta sync** — only fetch changed tasks, not all tasks every time
5. **Low-frequency activity polling** — keyboard/mouse events sampled every 60 seconds, not continuously
6. **Image compression** — screenshots WebP-compressed before upload (80% smaller than PNG)
7. **Settings cached locally** — SQLite cache, no API call on every setting read
8. **Offline first** — app works fully without internet

### Local Storage Strategy

```
Desktop SQLite contains:
  - Cached projects + tasks  (refreshed every 15 min)
  - Active session data      (crash-safe, no lost time)
  - Pending screenshots      (upload queue when back online)
  - Pending activity logs    (sync queue)
  - Settings cache           (instant reads, no API hit)
```

---

## 12. Cross-Platform Strategy

### Platform Support

| Platform | Version | Status |
|----------|---------|--------|
| macOS (Apple Silicon) | M1/M2/M3 | ✅ Full Support |
| macOS (Intel) | 10.15+ | ✅ Full Support |
| Windows | 10/11 (x64 + ARM) | ✅ Full Support |
| Linux | Ubuntu, Fedora | ✅ Full Support |

### Platform-Specific Handling

| Feature | macOS | Windows |
|---------|-------|---------|
| Screen capture | Privacy prompt required | No prompt needed |
| Secret storage | Keychain API | Windows DPAPI |
| Auto-start | LaunchAgents | Registry / Startup folder |
| System tray | Menu bar icon | System tray icon |
| Notifications | UNUserNotification | Windows Toast |
| Permissions | Must request explicitly | Available directly |

### macOS Permission Flow (First Launch)

```
1. App launches for the first time
2. Detects macOS
3. Shows in-app permission guide:
   "TrackSync needs Screen Recording permission
    to capture screenshots as required by your organization."
   [Open System Settings]  [Skip - Screenshots Disabled for My Org]
4. User navigates to System Settings → Privacy → Screen Recording
5. User toggles TrackSync on
6. App detects permission granted → enables screenshot feature
7. If org has screenshots disabled → permission never requested at all
```

---

## 12. Desktop App — Screen by Screen

### Screen 1: Login
- Email + password or SSO (Google, Microsoft)
- Organization auto-detected from email domain
- JWT stored securely in OS keychain (never in file or localStorage)

### Screen 2: Project Selector
```
┌────────────────────────────────────┐
│  👤 John Doe | Acme Corp     ⚙️   │
├────────────────────────────────────┤
│  Connected to: Jira                │
│                                    │
│  My Projects:                      │
│  ○ Website Redesign                │
│  ○ Mobile App v2                   │
│  ● Backend API  ← selected         │
└────────────────────────────────────┘
```

### Screen 3: Task Selector
```
┌────────────────────────────────────┐
│  ← Backend API                     │
│  My Tasks:                         │
│  ┌──────────────────────────────┐  │
│  │ 🔴 API-123 Fix auth bug      │  │
│  │ 🟡 API-124 Add rate limiting │  │
│  │ 🟢 API-125 Write unit tests  │  │
│  └──────────────────────────────┘  │
│  [🔍 Search tasks...]              │
└────────────────────────────────────┘
```

### Screen 4: Active Tracking
```
┌────────────────────────────────────┐
│  🔴 TRACKING                       │
│  API-123: Fix auth bug             │
│                                    │
│         01:23:45                   │
│                                    │
│  📸 Next screenshot in: 4:32       │
│  ⌨️  Activity: ████████░░ 82%     │
│                                    │
│    [Pause]      [Stop & Log]       │
└────────────────────────────────────┘
```

### Screen 5: Log Work
```
┌────────────────────────────────────┐
│  Log Work — 1h 23m 45s            │
│  Task: API-123 Fix auth bug        │
│                                    │
│  Notes: [Fixed JWT expiry issue  ] │
│                                    │
│  Log to:                           │
│  ☑ Jira  (API-123)                │
│  ☑ Tempo                          │
│  ☐ Google Sheets                   │
│                                    │
│  [Discard]        [Log Work ✓]    │
└────────────────────────────────────┘
```

---

## 13. Admin Panel Architecture

### Super Admin Panel (You)

```
/super-admin
  /dashboard
      MRR, active orgs, churn rate, total users
  /organizations
    /list              all orgs, status, seats, plan, MRR
    /[id]
      /overview        org details + quick actions
      /settings        ALL feature flags (SS, activity, intervals)
      /users           all users in org
      /billing         subscription, payment history, suspend button
      /integrations    which tool connected, sync status
      /audit-log       all changes made to this org ever
  /integrations
    /list              all available integrations + status
    /add               register new integration
    /[slug]/edit       edit integration config
  /billing
    /overview          revenue dashboard, MRR chart
    /failed-payments   orgs with payment issues
  /audit-log           all your own actions ever
  /settings            global defaults for new orgs
```

### Org Admin Panel

```
/admin
  /dashboard           team overview, hours today/week, active now
  /team
    /users             invite, remove, assign manager, suspend
    /[id]              user detail, time logs, screenshots, activity
  /projects            synced projects, assign to team members
  /reports
    /time              by user, project, date range
    /activity          productivity scores, heatmaps
    /screenshots       browse, filter by user/date
  /integration         connect/reconnect their tool
  /export              CSV, PDF reports
```

### Manager Panel

```
/manager
  /dashboard           my team overview only
  /team                only their direct reports
  /reports             their team only (time + activity)
```

---

## 14. Complete Data Flow

### Org Setup Flow

```
Super Admin creates org in panel
    → Org admin gets invite email
    → Org admin logs into web panel
    → Connects Jira (enters domain + API token / OAuth)
    → System validates credentials
    → Syncs all projects + users from Jira
    → Maps Jira users to TrackSync users by email
    → Org admin invites employees (or bulk import CSV)
    → Employees get invite email with desktop app download link
    → Employee installs app → logs in → ready to track
```

### Daily Tracking Flow

```
Employee opens app
    → App checks org status (active?) → loads settings from cache
    → Fetches assigned projects + tasks (local cache + refresh)
    → Selects project → selects task
    → Clicks Start Tracking
    → Timer begins + saved to local SQLite immediately
    → Every N minutes (from org_settings): screenshot captured + uploaded to S3
    → Every 60 seconds: activity data recorded
    → User clicks Stop
    → Session saved (locally + server)
    → Log Work screen appears
    → User selects where to log (Jira / Tempo / Sheets)
    → Work logged via integration plugin
    → Session marked complete + synced
```

### Settings Change Flow (Real-Time)

```
Super Admin changes screenshot interval for Acme Corp
    → API call updates org_settings
    → Audit log created
    → WebSocket broadcast to all Acme Corp connected desktop clients
    → Each desktop app receives 'settings:updated' event
    → New interval applied immediately, no restart required
```

### Billing Cutoff Flow

```
Stripe fires payment_failed webhook
    → org.billing_status = 'overdue'
    → Day 1: Warning email to org admin
    → Day 3: Auto-suspend triggers
    → org.status = 'suspended'
    → WebSocket broadcast: all sessions terminated
    → Desktop apps show suspension screen
    → Org admin pays outstanding invoice
    → Stripe fires payment_succeeded
    → org.status = 'active' instantly
    → All employees regain access
```

---

## 15. Subscription & Billing Model

### Pricing Tiers

| Plan | Price | Seats | Features |
|------|-------|-------|----------|
| **Starter** | $6/user/mo | Up to 10 | Basic tracking, 1 integration, screenshots |
| **Growth** | $10/user/mo | Up to 50 | All integrations, reports, Google Sheets export |
| **Business** | $15/user/mo | Unlimited | SSO, audit logs, API access, priority support |
| **Enterprise** | Custom | Unlimited | On-premise, SLA, custom integrations, white-label |

### Stripe Integration Details

- Stripe Billing for seat-based subscriptions
- Grace period of 3 days on payment failure before suspension
- Stripe Customer Portal for self-serve plan changes
- Webhooks handle: `invoice.payment_failed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
- Proration on seat additions mid-cycle

---

## 16. Security Checklist

- OAuth tokens encrypted at rest (AES-256)
- JWT with short expiry + refresh token rotation
- Desktop token stored in OS keychain (never in plain files)
- Screenshots stored in private S3 buckets — signed URLs only, expire in 1 hour
- HTTPS everywhere (TLS 1.3)
- Role-based access control (RBAC) enforced on every API route
- Row-level security — users can never access other org's data
- SOC 2 compliance roadmap (required for enterprise sales)
- GDPR compliance — data deletion on request, data export available
- Audit logs for every super admin and org admin action
- Screenshot grace period — users can delete their own within N seconds
- Activity data: keystrokes counted, never logged content
- Consent flow on desktop app install — user sees what is tracked

---

## 17. Development Roadmap

### Phase 1 — Foundation (Month 1-2)
- [ ] Database schema + Prisma migrations
- [ ] Auth system: Super Admin, Org Admin, Employee roles
- [ ] Org management + feature flags system
- [ ] Stripe integration + billing cutoff (auto + manual)
- [ ] Basic Super Admin panel (orgs, settings, billing)
- [ ] WebSocket server for real-time settings push

### Phase 2 — Integration Engine (Month 2-3)
- [ ] Base integration interface + factory pattern
- [ ] Jira plugin (OAuth + projects + tasks + time log)
- [ ] Asana plugin
- [ ] Org-level credential connection flow
- [ ] Project + task sync engine (delta sync)
- [ ] User mapping (external tool user ↔ TrackSync user)

### Phase 3 — Desktop App MVP (Month 3-4)
- [ ] Electron app scaffold (React + Vite + electron-builder)
- [ ] Login + org settings sync + offline cache
- [ ] Project / task browsing
- [ ] Time tracking (start / stop / pause)
- [ ] Screenshot capture (interval from org_settings)
- [ ] Activity tracking (keyboard + mouse + app)
- [ ] Offline mode + local SQLite
- [ ] Work log submission to Jira / Sheets
- [ ] System tray icon + notifications

### Phase 4 — Admin Panels (Month 4-5)
- [ ] Org Admin panel (users, reports, screenshots, integration)
- [ ] Manager panel (team view)
- [ ] Super Admin full panel (all orgs, settings, billing)
- [ ] Real-time settings push to desktop apps
- [ ] Screenshot viewer (per user, per day)
- [ ] Activity heatmaps + productivity charts

### Phase 5 — Polish & Launch (Month 5-6)
- [ ] More integrations (Linear, ClickUp, GitHub, Trello, Tempo)
- [ ] Google Sheets export
- [ ] CSV / PDF report export
- [ ] Auto-update system for desktop app
- [ ] macOS + Windows + Linux cross-platform testing
- [ ] Security audit
- [ ] Beta with 2-3 pilot organizations
- [ ] Public launch

### Phase 6 — Scale (Month 7-9)
- [ ] SSO (SAML, Google Workspace, Microsoft Entra)
- [ ] Public API for custom integrations
- [ ] Zapier / Make connector
- [ ] Mobile companion app (reports only)
- [ ] AI productivity insights (anomaly detection, trends)
- [ ] White-labeling for enterprise
- [ ] On-premise deployment option

---

## 18. Team Structure

| Role | Phase 1-2 | Phase 3+ |
|------|-----------|----------|
| Backend Developer | 1 | 2 |
| Desktop Developer (Electron/Node.js) | 1 | 1 |
| Frontend Developer (Web Panel) | 1 | 1-2 |
| UI/UX Designer | Part-time | 1 |
| DevOps / Infra | Part-time | 1 |
| QA Engineer | Part-time | 1 |

**Minimum viable team for MVP:** 3 developers (1 backend, 1 desktop, 1 frontend) + 1 part-time designer

---

## 19. Go-to-Market Strategy

**Primary Target:** IT/software companies with 10–200 employees

**Sales Motion:** Bottom-up — one engineering manager tries it, spreads to team, team lead upgrades to org plan

**Free Trial:** 14 days, no credit card required, full features

**Key Positioning:** *"The only time tracker that works with the tools your team already uses — no manual imports, no double entry."*

**Key Differentiators:**
1. Org-level integration (no per-user token setup)
2. Two-way sync (log time back into Jira/Asana automatically)
3. Real-time feature control per org
4. Ultra-lightweight desktop app (not another Electron memory hog)
5. Super Admin control panel (makes you, the SaaS owner, fully in control)

---

## 20. Key Challenges

### 1. API Rate Limits
Jira/Asana have strict limits. Solution: use webhooks + smart delta caching rather than constant polling.

### 2. OAuth Token Management
Tokens expire and orgs may rotate API keys. Build solid auto-refresh logic with error detection and prompt org admin to reconnect when needed.

### 3. Screenshot Privacy Laws
Different countries have different employee monitoring laws (especially EU/GDPR). Add explicit consent flows, make screenshot feature opt-in where required, and include a clear privacy notice on install.

### 4. Offline Tracking
Users may lose internet mid-session. All session data must be stored in local SQLite and synced reliably when connection returns. Handle conflicts (e.g., server session vs local session) gracefully.

### 5. Auto-Updates
Desktop apps need silent auto-updates. `electron-updater` (part of `electron-builder`) handles this with signed delta updates published to GitHub Releases or S3. You must maintain a release server and a versioning strategy.

### 6. macOS Screen Recording Permissions
macOS requires explicit user permission for screen capture via System Preferences. This must be handled gracefully in onboarding — don't just crash or fail silently.

### 7. User Mapping Across Tools
Jira users and TrackSync users need to be matched. Primary strategy: match by email. Fallback: org admin manually maps unmatchable users.

### 8. Multi-Region Data Compliance
Enterprise orgs (especially in EU) may require data to stay in their region. Plan for multi-region deployment (AWS eu-west-1 etc.) early to avoid costly rewrites.

---

*Document Version: 1.0 — Initial Complete Plan*  
*Last Updated: March 2026*