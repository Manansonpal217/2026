# Admin Panel Module 05 — Integration Management

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + React Query  
**Routes:** `/admin/integration`, `/super-admin/integrations/*`  
**Access:** Org Admin (connect own org), Super Admin (manage available integrations globally)

---

## Overview

Two-level integration management:

1. **Org Admin** connects their organization's project tool (Jira, Asana, etc.) — done once for the whole org
2. **Super Admin** manages which integrations are available globally — can add new ones, enable/disable

---

## Org Admin: Connect Integration

### Page: `/admin/integration`

```
┌──────────────────────────────────────────────────────────┐
│  Project Tool Integration                                │
│                                                          │
│  Currently connected: Jira ✅                            │
│  Last synced: 5 minutes ago                              │
│  Projects synced: 8    Tasks synced: 243                 │
│                                                          │
│  [Force Sync]  [Reconnect]  [Disconnect]                 │
│  ─────────────────────────────────────                   │
│  Connect a different tool:                               │
│                                                          │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌────────────┐          │
│  │ Jira │  │Asana │  │Linear│  │Google Sheet│          │
│  └──────┘  └──────┘  └──────┘  └────────────┘          │
│  ┌──────┐  ┌──────┐                                      │
│  │GitHub│  │ClickUp                                       │
│  └──────┘  └──────┘                                      │
└──────────────────────────────────────────────────────────┘
```

---

### Connecting Jira (OAuth Flow)

1. Click Jira card
2. Enter Jira domain: `acme.atlassian.net`
3. Click "Connect with Jira"
4. Redirect to Atlassian OAuth consent screen
5. Admin authorizes → callback hits backend
6. Success: return to integration page, shows "Jira Connected ✅"
7. Background sync begins immediately

---

### Connecting with API Key (e.g., Linear, GitHub)

Modal:

```
Connect Linear

API Key:   [____________________]  [?]
Team ID:   [____________________]  (optional)

[Cancel]  [Validate & Connect]
```

On click "Validate & Connect":

- Backend calls `plugin.validateCredentials()`
- If valid: saves encrypted, starts sync
- If invalid: shows specific error (e.g., "Invalid API key" or "Insufficient permissions")

---

### Sync Status Display

```
Last Sync: 5 minutes ago ✅
Projects: 8  |  Tasks: 243  |  Users mapped: 21/23

⚠️  2 users couldn't be auto-mapped.
    [Map manually →]
```

Manual user mapping:

```
These Jira users couldn't be matched by email:
┌──────────────────────┬──────────────────────┐
│ Jira User            │ TrackSync User       │
├──────────────────────┼──────────────────────┤
│ jdoe-contractor      │ [Select user ▼]      │
│ bob.freelance        │ [Select user ▼]      │
└──────────────────────┴──────────────────────┘
[Save Mappings]
```

---

## Super Admin: Integration Catalog

### Page: `/super-admin/integrations`

```
┌──────────────────────────────────────────────────────────┐
│  Available Integrations              [+ Register New]    │
│                                                          │
│  Name        Slug      Auth Type    Status  Orgs using  │
│  ───────── ─────────  ──────────── ──────── ───────────  │
│  Jira      jira       OAuth 2.0    ✅ Active    24       │
│  Asana     asana      OAuth 2.0    ✅ Active    11       │
│  Linear    linear     API Key      ✅ Active     3       │
│  GitHub    github     PAT          ✅ Active     8       │
│  Notion    notion     OAuth 2.0    🚧 Beta       1       │
└──────────────────────────────────────────────────────────┘
```

---

### Page: `/super-admin/integrations/add` — Register New Integration

```
Register New Integration

Name:        [Notion             ]
Slug:        [notion             ]  ← auto-generated, must match plugin folder name
Logo URL:    [___________________]
Auth Type:   [OAuth 2.0 ▼]
Features:
  ☑ Supports Projects
  ☑ Supports Tasks
  ☐ Supports Time Log
  ☐ Supports Webhooks
Status:      [Beta ▼]

Config Schema (JSON):
[{
  "key": "workspace_id",
  "label": "Workspace ID",
  "required": true
}]

[Cancel]  [Register Integration]
```

On register:

- Inserts row into `integration_definitions`
- Integration appears in org connect UI automatically
- Plugin code must already be deployed in `/integrations/plugins/notion/`

---

### Page: `/super-admin/integrations/[slug]/edit` — Edit Integration

- Toggle `is_active` (hide from org connect UI without removing)
- Edit `config_schema` (what fields org admin sees when connecting)
- View all orgs using this integration

---

## API Calls

```typescript
// Org Admin
GET    /admin/integrations/available           // available integrations to connect
GET    /admin/integrations/status              // current connection status
GET    /admin/integrations/:slug/oauth/start   // start OAuth flow
POST   /admin/integrations/:slug/connect       // connect with API key
DELETE /admin/integrations/:slug               // disconnect
POST   /admin/integrations/:slug/sync          // force sync
GET    /admin/integrations/:slug/sync-status   // sync status + counts
PATCH  /admin/integrations/:slug/user-mapping  // save manual user mappings

// Super Admin
GET    /super-admin/integrations               // all integrations catalog
POST   /super-admin/integrations               // register new
PATCH  /super-admin/integrations/:slug         // edit
GET    /super-admin/integrations/:slug/orgs    // orgs using this integration
```
