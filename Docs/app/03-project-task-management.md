# App Module 03 — Project & Task Management

**Platform:** Desktop App (Electron + React)  
**Depends on:** Backend Module 05 (Integration Engine), Backend Module 03 (User Management)

---

## Overview

Displays all projects and tasks assigned to the logged-in employee from their organization's connected integration (Jira, Asana, Linear, etc.). Uses a local SQLite cache for instant loads and offline access, refreshing from the server in the background.

---

## Screens

### Project Selector (Screen 2)
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

### Task Selector (Screen 3)
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

---

## Data Loading Strategy

### On App Start (after login)
```
1. Load projects from local SQLite immediately (instant display)
2. In background: GET /app/projects?since=<last_synced_at>
   → Delta sync: only changed projects returned
   → Merge into local SQLite cache
   → UI updates if new data received
```

### Cache TTL
| Data | Refresh Interval |
|------|-----------------|
| Projects list | 15 minutes (background) |
| Tasks list | 15 minutes (background) |
| On manual pull-to-refresh | Immediate |
| On app resume from sleep | Immediate |

### Offline Behavior
```
No internet:
    → Show cached projects + tasks normally
    → Show subtle "Offline — showing cached data" indicator
    → User can still select task and start timer (offline session)
```

---

## Local Storage (SQLite)

```sql
cached_projects
  id                TEXT PRIMARY KEY   -- server UUID
  org_id            TEXT
  integration_slug  TEXT               -- "jira", "asana"
  external_id       TEXT
  name              TEXT
  description       TEXT
  status            TEXT
  metadata          TEXT               -- JSON blob
  last_synced_at    INTEGER

cached_tasks
  id                TEXT PRIMARY KEY
  project_id        TEXT FK → cached_projects
  external_id       TEXT
  title             TEXT
  description       TEXT
  status            TEXT               -- todo | in_progress | done
  priority          TEXT               -- low | medium | high | urgent
  external_url      TEXT
  due_date          TEXT
  metadata          TEXT               -- JSON blob
  last_synced_at    INTEGER
```

---

## Task Filtering & Search

- **Default view:** Only tasks assigned to logged-in user
- **Search:** Local full-text search on `title` + `external_id` (no API call)
- **Filter by status:** All / In Progress / To Do / Done
- **Sort:** By priority, by due date, by last updated
- Task row shows: external ID badge, title, priority color dot, due date (if set)

---

## Integration Display

- The header shows which tool is connected ("Connected to: Jira")
- If no integration connected for the org: show "Your admin hasn't connected a project tool yet"
- If `force_task_selection = false`: show a "Start without task" option at the bottom of the task list

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/app/projects` | Fetch assigned projects (delta sync) |
| GET | `/app/projects/:id/tasks` | Fetch tasks for a project (delta sync) |
| GET | `/app/tasks/search?q=` | Server-side search (fallback) |
