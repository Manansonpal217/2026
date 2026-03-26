# App Module 08 — Work Log Submission

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 04 (Time Tracking), Backend Module 05 (Integration Engine), Backend Module 06 (Time Sessions API)

---

## Overview

After a session is stopped, the employee reviews and submits their work log to external tools (Jira, Asana, Tempo, Google Sheets, etc.). The screen shows the session summary and lets the user choose where to log the time, add notes, and confirm submission.

---

## Screen — Log Work (Screen 5)

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

## Available Log Targets

Shown dynamically based on:

1. Which integrations the org has connected
2. What the connected integration supports (e.g., Jira supports time logs, Asana does not in v1)
3. Whether the task has a valid `external_id` (required for Jira/Tempo)

| Target         | Shown when                                              |
| -------------- | ------------------------------------------------------- |
| Jira           | Jira connected + task has Jira external_id              |
| Tempo          | Tempo connected (as a Jira plugin)                      |
| Asana          | Asana connected + supports_time_log = true              |
| Linear         | Linear connected + supports_time_log = true             |
| Google Sheets  | Google Sheets integration connected                     |
| TrackSync only | Always available (log internally without external tool) |

---

## Submission Flow

```
User clicks [Log Work ✓]
    → Validate: at least one target selected (or TrackSync only)
    → POST /app/sessions/:id/log-work
       Body: {
         notes: "Fixed JWT expiry issue",
         targets: ["jira", "tempo"],
         duration_override: null   // null = use session duration
       }
    → Backend calls each integration plugin in parallel
    → Response: { results: [{ target, status, error? }] }
    → Show result summary:
         ✅ Jira — logged 1h 23m
         ✅ Tempo — logged 1h 23m
         ❌ Google Sheets — failed: auth error [Retry]
    → Update local_sessions.logged_externally = 1
    → Navigate to Project Selector (ready for next task)
```

---

## Duration Editing

- By default uses session `duration_seconds` (minus idle if discarded)
- User can manually adjust time before logging (rounded to nearest minute)
- Edited duration stored in `work_log_exports.duration_logged` (not overwriting session)

---

## Notes Field

- Free text, max 1000 characters
- Pre-populated if user typed notes during session (future feature)
- Sent to external tool as the work log comment/description

---

## Partial Failure Handling

```
If some targets succeed and others fail:
    → Show per-target status
    → Failed targets show [Retry] button
    → User can retry only the failed ones
    → Successful ones not re-submitted

If all fail:
    → Show error for each
    → [Retry All] button
    → Session remains in local SQLite as logged_externally = 0
    → Sync worker does NOT auto-retry work log (user must explicitly retry)
```

---

## Discard Flow

```
User clicks [Discard]
    → Confirm dialog: "Discard this session? This cannot be undone."
    → [Cancel]  [Yes, Discard]
    → local_sessions.status = 'discarded'
    → No work log created
    → Navigate back to Project Selector
```

---

## Local Storage Update

```sql
-- After successful log work:
UPDATE local_sessions
SET logged_externally = 1,
    notes = '<user notes>'
WHERE id = '<session_id>'

-- work_log_exports tracked server-side in work_log_exports table
```

---

## API Endpoints Used

| Method | Endpoint                           | Purpose                               |
| ------ | ---------------------------------- | ------------------------------------- |
| POST   | `/app/sessions/:id/log-work`       | Submit work log to external tools     |
| POST   | `/app/sessions/:id/log-work/retry` | Retry failed targets only             |
| GET    | `/app/sessions/:id/log-targets`    | Get available log targets for session |
