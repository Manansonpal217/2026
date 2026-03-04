# App Module 12 — Manual Time Entry

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 03 (Projects/Tasks), App Module 08 (Work Log Submission), Backend Module 06 (Time Sessions API)

---

## Overview

Employees often do work that cannot be captured automatically — meetings, phone calls, travel, whiteboard sessions. Manual time entry lets them log this work after the fact. Manual sessions are clearly labeled in all reports and never have screenshots or activity data.

---

## Screen — Add Time Manually

Accessible from:
1. Project/Task selector screen → `[+ Add Time Manually]` button
2. System tray menu → `[Add Manual Time]`
3. Keyboard shortcut: `Cmd/Ctrl+Shift+M`

```
┌────────────────────────────────────────────┐
│  ← Add Time Manually                       │
│                                            │
│  Project:   [Backend API ▼]               │
│  Task:      [API-123 Fix auth bug ▼]      │
│             [Search tasks...]              │
│                                            │
│  Date:      [Mar 4, 2026 ▼]              │
│                                            │
│  Time:      [09:00 AM] to [11:15 AM]      │
│  Duration:  2h 15m  (auto-calculated)     │
│             OR                             │
│  Duration:  [2] hours [15] minutes         │
│                                            │
│  Notes:     [Had a design meeting with    ]│
│             [the client to review UI...   ]│
│                                            │
│  Log to:                                   │
│  ☑ Jira  (API-123)                        │
│  ☐ Tempo                                   │
│  ☐ Google Sheets                           │
│                                            │
│  [Cancel]          [Add Manual Time ✓]    │
└────────────────────────────────────────────┘
```

---

## Input Modes

### Mode 1: Start/End Time
- User picks date, then start time and end time
- Duration auto-calculated: `(end_time - start_time) - any_idle`
- Both pickers: 15-minute increments (smoother UX)

### Mode 2: Duration Only
- User picks date and enters hours + minutes directly
- Logged as: started_at = date + 9:00 AM, ended_at = computed from duration
- (Start time defaults to 9 AM as a reasonable placeholder for external tool logging)

---

## Validation Rules

| Rule | Detail |
|------|--------|
| Max duration | 24 hours per manual entry |
| Future dates | Blocked — cannot add time for tomorrow |
| Past limit | Max 30 days in the past (configurable by org admin) |
| Overlap check | Warn if time overlaps with an existing session (not blocked, just warned) |
| Task required | If `force_task_selection = true` (can be bypassed if org allows) |

---

## Overlap Warning

```
⚠️  This time overlaps with an existing session:
    API-124 Add rate limiting — 10:00 AM to 12:00 PM (today)
    
    You can still save this entry. Both sessions will appear in reports.
    [Cancel]  [Save Anyway]
```

---

## Submission Flow

```
User clicks [Add Manual Time ✓]
    → Validate all fields
    → Show overlap warning if applicable
    → Create local session in SQLite:
        {
          status: 'completed',
          is_manual: true,
          started_at: computed,
          ended_at: computed,
          duration_seconds: computed,
          notes: user notes
        }
    → Sync engine pushes to server (POST /v1/app/sessions/sync)
    → If log targets selected: POST /v1/app/sessions/:id/log-work
    → Success toast: "2h 15m added to API-123"
    → Navigate back to Project Selector
```

---

## How Manual Sessions Are Labeled

In all reports and admin views, manual sessions are clearly distinguished:

```typescript
// Time report row:
{
  session_id: "...",
  task: "API-123 Fix auth bug",
  duration: "2h 15m",
  activity: null,          // no activity score
  screenshots: 0,          // no screenshots
  type: "Manual",          // ← badge shown in reports
  is_manual: true
}
```

Admin panel shows a `[Manual]` badge on these sessions. No activity heatmap data, no screenshots shown.

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/app/sessions/sync` | Sync manual session to server |
| POST | `/v1/app/sessions/:id/log-work` | Log to Jira/Sheets |
| GET | `/v1/app/sessions/check-overlap?started_at=&ended_at=` | Check for time overlap |
