# Admin Panel Module 03 — User Management

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + React Query  
**Routes:** `/admin/team/*`, `/manager/team/*`  
**Access:** Org Admin (full team), Manager (own team only)

---

## Overview

Org Admin manages all users in their organization. Managers can view only their direct reports. Both can see user details, time stats, and navigate to that user's reports.

---

## Pages

### `/admin/team` — User List

```
┌──────────────────────────────────────────────────────────┐
│  Team                            [+ Invite User] [Import]│
│  Search: [____________]  Role ▼  Status ▼                │
│                                                          │
│  Name          Email              Role     Status   Last │
│  ─────────── ──────────────────  ──────── ──────── ─────│
│  John Doe    john@acme.com       Employee ✅ Active  2h  │
│  Jane Smith  jane@acme.com       Manager  ✅ Active  Now │
│  Bob Wilson  bob@acme.com        Employee ⚠️ Inactive 5d │
│                                                          │
│  Showing 1-25 of 38 users                                │
└──────────────────────────────────────────────────────────┘
```

Columns: Avatar, Name, Email, Role badge, Status, Manager, Last active  
Filters: Role (employee/manager/org_admin), Status (active/inactive/suspended), Search by name/email  
Actions per row: `[View]` `[...more]` → Edit / Suspend / Remove

---

### `/admin/team/invite` — Invite User Modal / Page

```
Invite Team Member

Email:    [john@acme.com     ]
Name:     [John Doe          ]
Role:     [Employee ▼]
Manager:  [Jane Smith ▼]     ← shown if role = Employee

[Cancel]  [Send Invite]
```

Shows remaining seats: "14 seats remaining"  
If seats exhausted: shows upgrade CTA.

---

### `/admin/team/import` — Bulk Import CSV

Upload a CSV with columns: `email`, `name`, `role`, `manager_email`  
Preview table shows parsed rows before submitting.  
On submit: shows results — success count, failed rows with reasons.

---

### `/admin/team/[userId]` — User Detail Page

Tabs: **Overview** | **Time Logs** | **Screenshots** | **Activity**

#### Tab: Overview
```
┌──────────────────────────────────────┐
│  👤 John Doe                         │
│  john@acme.com  |  Employee          │
│  Manager: Jane Smith                 │
│  Status: ✅ Active                   │
│  Last active: 2 hours ago            │
│  ─────────────────────────────────── │
│  This Week:                          │
│  Hours tracked:    28.5h             │
│  Sessions:         12                │
│  Avg activity:     74%               │
│  Screenshots:      42                │
│  ─────────────────────────────────── │
│  [Edit User]  [Suspend]  [Remove]    │
└──────────────────────────────────────┘
```

#### Tab: Time Logs
Filterable list of sessions: date, task, duration, activity %, log status.  
Date range picker.  
Total hours shown at top.  
Click session → expanded view with screenshot thumbnails.

#### Tab: Screenshots
Grid of screenshot thumbnails, sorted by date.  
Filter by date range.  
Click thumbnail → full-size modal with signed URL.  
Activity score badge on each screenshot (green/yellow/red).  
Admin can delete screenshots from this view.

#### Tab: Activity
- Daily activity heatmap (hour of day vs day of week)
- App usage pie chart
- Productivity trend line chart (last 30 days)

---

### `/manager/team` — Manager View

Same layout as `/admin/team` but:
- Only shows users where `manager_id = current_user.id`
- No invite / import capabilities
- Can view user details (read-only)
- No suspend / remove actions

---

## Edit User Modal

```
Edit John Doe

Name:     [John Doe          ]
Role:     [Employee ▼]
Manager:  [Jane Smith ▼]
Status:   [Active ▼]

[Cancel]  [Save Changes]
```

Role change: triggers audit log.  
Status = 'suspended': shows confirmation: "This will log out John from all devices."

---

## API Calls

```typescript
// Org Admin
GET    /admin/users                         // list with filters
POST   /admin/users/invite                  // single invite
POST   /admin/users/import                  // bulk CSV
GET    /admin/users/:id                     // user detail + stats
PATCH  /admin/users/:id                     // update user
DELETE /admin/users/:id                     // remove user
PATCH  /admin/users/:id/manager             // assign manager
GET    /admin/users/:id/sessions            // time logs
GET    /admin/users/:id/screenshots         // screenshots
GET    /admin/users/:id/reports/heatmap     // activity heatmap
GET    /admin/users/:id/reports/app-usage   // app usage

// Manager
GET    /manager/team                        // own team only
GET    /manager/team/:id                    // team member detail (read-only)
```
