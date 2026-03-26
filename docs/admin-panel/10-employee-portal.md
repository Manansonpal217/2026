# Admin Panel Module 10 — Employee Web Portal

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + React Query  
**Routes:** `/employee/*`  
**Access:** `employee` and `manager` roles (own data only)

---

## Overview

Employees are not confined to the desktop app. The web portal gives them a browser-based view of their own time data, screenshots, and privacy controls. This is essential for:

- Viewing history on mobile / outside working hours
- Building trust (employees see exactly what their employer sees)
- GDPR compliance (data access + export + deletion)
- Disputing incorrect sessions

This is entirely separate from the Admin Panel (`/admin/*`) and Manager Panel (`/manager/*`).

---

## Pages

### `/employee/dashboard` — My Work Summary

```
┌──────────────────────────────────────────────────────────┐
│  My Work — John Doe                    [Settings] [Logout]│
├──────────────┬───────────────────────────────────────────┤
│  NAVIGATION  │  Dashboard                                │
│  ──────────  │                                           │
│  Dashboard   │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  My Sessions │  │ Today    │ │ This Week│ │ Avg Act. │  │
│  Screenshots │  │  6h 15m  │ │  28.5h   │ │  74% 🟢  │  │
│  Privacy     │  └──────────┘ └──────────┘ └──────────┘  │
│              │                                           │
│              │  Today's Timeline                         │
│              │  9:00 ─── [API-123 Fix auth bug 2h 15m]  │
│              │  11:15 ── [TASK-42 Write docs 45m]        │
│              │  14:00 ── [API-124 Rate limiting 1h 30m]  │
│              │                                           │
│              │  This Week — Hours Per Day                │
│              │  [Bar chart: Mon–Sun]                     │
└──────────────┴───────────────────────────────────────────┘
```

---

### `/employee/sessions` — My Session History

```
┌──────────────────────────────────────────────────────────┐
│  My Sessions              [This Week ▼]  [Export CSV]    │
│                                                          │
│  Date       Task                  Duration  Activity  SS │
│  ────────── ───────────────────── ──────── ─────────  ───│
│  Mar 4      API-123 Fix auth bug  2h 15m    74% 🟢    13 │
│  Mar 4      TASK-42 Write docs    45m       58% 🟡     4 │
│  Mar 3      API-124 Rate limiting 1h 30m    82% 🟢     9 │
│                                                          │
│  Total this week: 28.5 hours                             │
└──────────────────────────────────────────────────────────┘
```

Features:

- Click session row → expand to see timeline with screenshots
- "SS" column = screenshot count for that session
- Status badges: Approved ✅ / Pending ⏳ / Rejected ❌ (if time approval enabled)
- Export to CSV for own records

---

### Session Detail Expansion

```
▼ Mar 4 — API-123 Fix auth bug — 2h 15m

  Started: 9:00 AM    Ended: 11:15 AM
  Activity: 74%  |  Idle excluded: 3m  |  Screenshots: 13

  Screenshots:
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │ 🟢82%│ │ 🟡45%│ │ 🟢91%│ │ 🟢74%│ │ 🟢85%│
  │ 9:10 │ │ 9:20 │ │ 9:30 │ │ 9:40 │ │ 9:50 │
  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
  (Click to view full size)

  Logged to Jira: ✅ 2h 15m logged to API-123
  Notes: Fixed JWT expiry issue with refresh token rotation
```

---

### `/employee/screenshots` — My Screenshots

Same as the admin screenshots view but scoped to own data only. Employee sees exactly what their employer sees.

```
┌──────────────────────────────────────────────────────────┐
│  My Screenshots             [Today ▼]  User: Me          │
│                                                          │
│  Mar 4, 2026                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │ 🟢82%│ │ 🟡45%│ │ 🟢91%│ │ 🔴12%│ │ 🟢74%│          │
│  │ 9:10 │ │ 9:20 │ │ 9:30 │ │ 9:40 │ │ 9:50 │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
└──────────────────────────────────────────────────────────┘
```

- Click → full-size view modal
- Activity score badge on each
- Note: grace period delete is only available in the desktop app (within the countdown window)

---

### `/employee/privacy` — Privacy Controls

This is the web version of the Privacy screen from the desktop app (Module 11).

```
┌──────────────────────────────────────────────────────────┐
│  Privacy & My Data                                       │
│                                                          │
│  WHAT IS BEING COLLECTED                                 │
│  ─────────────────────────────────────────────────────── │
│  ✅ Sessions   ✅ Screenshots (10 min)  ✅ Keyboard count│
│  ✅ Mouse      ✅ App name              ❌ URLs           │
│                                                          │
│  Consent history:                                        │
│  Mar 4, 2026  Consented to policy v2.1                  │
│  Jan 15, 2026 Consented to policy v2.0                  │
│                                                          │
│  [📥 Export My Data (JSON)]  [📥 Export My Data (CSV)]  │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│  DANGER ZONE                                             │
│  [Request Account & Data Deletion]                       │
│  [Withdraw Consent]                                      │
└──────────────────────────────────────────────────────────┘
```

---

### `/employee/settings` — Account Settings

```
┌──────────────────────────────────────────────────────────┐
│  Account Settings                                        │
│                                                          │
│  Name:      John Doe         [Edit]                     │
│  Email:     john@acme.com                               │
│  Timezone:  America/New_York  [Change ▼]                │
│  Theme:     [System ▼]  (Light / Dark / System)         │
│                                                          │
│  Password                                               │
│  [Change Password]                                      │
│                                                          │
│  Two-Factor Authentication                               │
│  Status: Not enabled                                    │
│  [Set Up 2FA]                                           │
│                                                          │
│  Notification Preferences                               │
│  ☑ Email me a daily summary of my tracked hours         │
│  ☐ Email me when a session is approved/rejected         │
└──────────────────────────────────────────────────────────┘
```

---

## Authentication for Employee Web Portal

Employees use the same email/password credentials as the desktop app:

```typescript
// NextAuth.js config for employee portal
// Route: /employee/auth/login
// Separate from /web/auth/login (admin panel auth)

export const employeeAuthOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        const res = await fetch('/v1/web/auth/login', {
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })
        const user = await res.json()
        // Only allow employee/manager roles in this portal
        if (!['employee', 'manager'].includes(user.role)) {
          throw new Error('Use the admin panel at app.tracksync.io/admin')
        }
        return user
      },
    }),
    // SSO: Google + Microsoft (same providers as desktop app)
  ],
}
```

---

## API Endpoints Used

```typescript
GET /v1/app/my-sessions?from=&to=&format=json|csv
GET /v1/app/my-screenshots?from=&to=
GET /v1/app/my-screenshots/:id/view
GET /v1/app/my-data/export?format=json|csv
POST /v1/app/my-data/delete-request
POST /v1/app/my-consent/withdraw
GET /v1/app/my-consent/history
PATCH /v1/app/me/timezone
PATCH /v1/app/me/name
```
