# Admin Panel Module 04 — Feature Flags & Settings Control (Super Admin)

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + React Query  
**Routes:** `/super-admin/organizations/[id]/settings`, `/super-admin/settings/defaults`  
**Access:** `super_admin` only (Org Admin has read-only view of own settings)

---

## Overview

Super Admin controls all feature flags per organization. Changes are saved immediately and pushed to all connected desktop clients via WebSocket in real-time. Every change is audit logged with before/after values.

---

## Page: Org Settings (`/super-admin/organizations/[id]/settings`)

```
┌──────────────────────────────────────────────────────────┐
│  Settings — Acme Corp                                    │
│  Changes apply instantly to all connected desktop apps   │
│                                                          │
│  📸 SCREENSHOT SETTINGS                                  │
│  ─────────────────────────────────────────              │
│  Screenshots Enabled          [●───] ON                  │
│  Screenshot Interval          [5 min ▼]                  │
│  Allow User Delete            [●───] ON  [60 sec ▼]     │
│  Blur Screenshots             [───●] OFF                 │
│                                                          │
│  ⌨️  ACTIVITY TRACKING                                   │
│  ─────────────────────────────────────────              │
│  Activity Tracking Enabled    [●───] ON                  │
│  Track Keyboard Events        [●───] ON                  │
│  Track Mouse Events           [●───] ON                  │
│  Track Active App             [●───] ON                  │
│  Track URLs Visited           [───●] OFF                 │
│                                                          │
│  ⏱️  APP BEHAVIOR                                        │
│  ─────────────────────────────────────────              │
│  Idle Detection               [●───] ON  [5 min ▼]      │
│  Force Task Selection         [●───] ON                  │
│  Offline Tracking             [●───] ON                  │
│                                                          │
│  💳 BILLING                                              │
│  ─────────────────────────────────────────              │
│  Auto-suspend on Payment Fail [●───] ON                  │
└──────────────────────────────────────────────────────────┘
```

---

## Setting Controls

### Toggle Switch

Immediate save on toggle (no "Save" button needed):

```typescript
function SettingToggle({ setting, orgId }: Props) {
  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/super-admin/orgs/${orgId}/settings`, { [setting.key]: value })
  })

  return (
    <Switch
      checked={setting.value}
      onCheckedChange={(val) => mutation.mutate(val)}
      disabled={mutation.isPending}
    />
  )
}
```

### Dropdown Select (Interval)

```typescript
// Screenshot interval options: 5, 10, 15, 30 minutes
<Select
  value={settings.screenshot_interval.toString()}
  onValueChange={(val) =>
    updateSetting('screenshot_interval', parseInt(val))
  }
>
  <SelectItem value="5">5 minutes</SelectItem>
  <SelectItem value="10">10 minutes</SelectItem>
  <SelectItem value="15">15 minutes</SelectItem>
  <SelectItem value="30">30 minutes</SelectItem>
</Select>
```

### Number Input (Delete Window)

```typescript
// 0–300 seconds
<Input
  type="number"
  min={0}
  max={300}
  value={settings.screenshot_user_delete_window}
  onBlur={(e) => updateSetting('screenshot_user_delete_window', parseInt(e.target.value))}
/>
```

---

## Real-Time Feedback

After saving a setting:

```
✅ Setting updated — pushed to 23 connected devices
```

Shows count of connected desktop clients that received the push.

---

## Change Confirmation for High-Impact Settings

Some settings show a confirmation dialog:

```typescript
const HIGH_IMPACT_SETTINGS = [
  'screenshots_enabled',   // turning off clears pending screenshots
  'activity_tracking_enabled',
  'force_task_selection'
]

// When toggling a high-impact setting:
<AlertDialog>
  <AlertDialogTitle>Disable Screenshots for Acme Corp?</AlertDialogTitle>
  <AlertDialogDescription>
    This will immediately stop screenshot capture on all 23 connected devices.
    Existing screenshots will not be deleted.
  </AlertDialogDescription>
  <AlertDialogCancel>Cancel</AlertDialogCancel>
  <AlertDialogAction onClick={confirmChange}>Disable Screenshots</AlertDialogAction>
</AlertDialog>
```

---

## Audit Log Display

Below the settings form, shows last 10 changes:

```
[Today 14:32]  screenshot_interval changed: 10 → 5
[Today 10:15]  screenshots_enabled changed: true → false
[Yesterday]    track_url changed: false → true
```

Links to full audit log.

---

## Page: Global Defaults (`/super-admin/settings/defaults`)

Same form layout, but controls the default values applied to **new organizations** when created.

Changes here do NOT affect existing orgs.

---

## Org Admin: Read-Only View of Own Settings

Route: `/admin/settings`

Org Admin can SEE all current settings for their org but cannot change them.  
Each setting shows: current value + "Contact your TrackSync admin to change this."

---

## API Calls

```typescript
GET   /super-admin/orgs/:id/settings        // load current settings
PATCH /super-admin/orgs/:id/settings        // update (any subset of fields)
GET   /super-admin/settings/defaults        // global defaults
PATCH /super-admin/settings/defaults        // update defaults

// Org Admin (read-only)
GET   /admin/settings                       // own org settings (read-only)
```
