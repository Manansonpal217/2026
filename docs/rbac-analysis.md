# TrackSync — Codebase RBAC Analysis Report

> Generated: 2026-04-01

---

## 1. Database Schema

### All Models & Key Fields

| Model                  | Key Fields                                                                                                                                               | Status/Role/Enum Fields                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Organization`         | `id`, `name`, `slug`, `plan`, `status`, `data_region`, `trial_ends_at`, `trial_expired`                                                                  | `plan: String` ("trial", no enum), `status: String` ("active" \| "suspended")                                 |
| `OrgSettings`          | `id`, `org_id` (1:1)                                                                                                                                     | Many boolean policy flags; no role fields                                                                     |
| `User`                 | `id`, `org_id`, `email`, `password_hash`, `role`, `manager_id`, `name`, `timezone`, `status`, `mfa_enabled`, `is_platform_admin`, `can_add_offline_time` | `role: String @default("employee")`, `status: String` ("active" \| "suspended"), `is_platform_admin: Boolean` |
| `Invite`               | `id`, `org_id`, `email`, `role`, `token`, `accepted_at`, `expires_at`                                                                                    | `role: String @default("employee")`                                                                           |
| `RefreshToken`         | `id`, `user_id`, `token_hash`, `device_id`, `expires_at`                                                                                                 | —                                                                                                             |
| `Project`              | `id`, `org_id`, `name`, `color`, `archived`, `budget_hours`                                                                                              | `archived: Boolean`                                                                                           |
| `Task`                 | `id`, `project_id`, `org_id`, `name`, `status`, `external_id`, `assignee_user_id`                                                                        | `status: String` ("open")                                                                                     |
| `TimeSession`          | `id`, `user_id`, `org_id`, `project_id`, `task_id`, `device_id`, `started_at`, `ended_at`, `duration_sec`, `is_manual`, `approval_status`                | `approval_status: String` ("pending" \| "approved" \| "rejected")                                             |
| `Screenshot`           | `id`, `session_id`, `user_id`, `org_id`, `s3_key`, `thumb_s3_key`, `taken_at`, `activity_score`, `is_blurred`, `deleted_at`                              | —                                                                                                             |
| `SessionTimeDeduction` | `id`, `session_id`, `range_start`, `range_end`, `reason`                                                                                                 | `reason: String` ("screenshot_deleted")                                                                       |
| `Integration`          | `id`, `org_id`, `type`, `name`, `status`, `auth_data`, `kms_key_id`, `config`, `last_sync_at`                                                            | `status: String` ("active")                                                                                   |
| `OAuthState`           | `id`, `integration_id`, `org_id`, `state`, `provider`, `redirect_uri`, `code_verifier`                                                                   | —                                                                                                             |
| `AuditLog`             | `id`, `org_id`, `actor_id`, `action`, `target_type`, `target_id`, `old_value`, `new_value`, `ip_address`                                                 | —                                                                                                             |
| `ActivityLog`          | `id`, `session_id`, `user_id`, `org_id`, `window_start`, `window_end`, `keyboard_events`, `mouse_clicks`, `active_app`, `active_url`, `activity_score`   | —                                                                                                             |
| `OfflineTime`          | `id`, `org_id`, `user_id`, `added_by_id`, `start_time`, `end_time`, `description`                                                                        | —                                                                                                             |
| `AgentToken`           | `id`, `org_id`, `token_hash`, `name`, `last_seen_at`                                                                                                     | —                                                                                                             |
| `AgentCommand`         | `id`, `org_id`, `user_id`, `type`, `status`, `payload`, `attempts`                                                                                       | `status: String` ("pending")                                                                                  |
| `AgentHeartbeat`       | `id`, `org_id`, `agent_version`, `status`, `last_seen_at`                                                                                                | `status: String` ("online")                                                                                   |
| `JiraIssue`            | `id`, `org_id`, `jira_id`, `key`, `summary`, `status`, `assignee_email`, `priority`                                                                      | —                                                                                                             |

> **Critical:** Every "enum-like" field (`role`, `status`, `plan`, `approval_status`) is stored as a raw `String` in Postgres. There are no Prisma `enum` types defined anywhere in the schema.

---

## 2. Auth & Authorization

### Authentication Flow

**File:** `packages/backend/src/middleware/authenticate.ts`

1. Extract `Bearer <token>` from `Authorization` header
2. Verify JWT signature via `verifyToken()` → extracts `sub` (user ID), `org_id`, `role`, `jti`
3. Check JTI blacklist in Redis → blocks revoked tokens
4. Check `user:status:v2:{userId}` Redis cache (60s TTL) → avoids DB hit on every request
5. On cache miss: query DB for `status`, `name`, `email`, `is_platform_admin`, `organization.status`
6. Gate on `user.status === "active"` and `org.status !== "suspended"`
7. Attach `request.user` (`id`, `org_id`, `email`, `name`, `role`, `is_platform_admin`) and `request.org`

> **Important:** `role` is read from the **JWT payload** (cryptographically signed at login), not re-fetched from DB on each request. Role changes only take effect after token re-issue.

### Authorization Middleware

**File:** `packages/backend/src/middleware/authenticate.ts`

| Function                                | Description                                            |
| --------------------------------------- | ------------------------------------------------------ |
| `createAuthenticateMiddleware(config)`  | Core auth gate — validates JWT + Redis cache           |
| `requireRole(...roles: string[])`       | Checks `request.user.role` is in the allowed list      |
| `requirePermission(...permissions)`     | Checks all listed permissions against role's grant set |
| `requirePlatformAdmin()`                | Requires `user.is_platform_admin === true`             |
| `requirePlatformAdminOrOrgSuperAdmin()` | Allows `is_platform_admin` OR `role === "super_admin"` |

---

## 3. User & Organization Model

### Multi-Tenancy Pattern

Single PostgreSQL database; every user-generated record carries an `org_id` foreign key. Tenants are isolated at the **application layer** via `WHERE org_id = ?` in every query. No row-level security in Postgres itself.

### Org Structure

```
Organization (1)
  └── OrgSettings (1:1)
  └── User[] (many)
        └── manager_id → User (self-referential hierarchy)
  └── Project[]
  └── Invite[]
  └── AuditLog[]
  └── Integration[]
  └── AgentToken[], AgentCommand[], AgentHeartbeat
```

### User Hierarchy

- `User.manager_id` → nullable self-reference — creates a flat manager tree (1 level: manager → direct reports)
- No "team" or "department" model exists — hierarchy is purely through manager assignment
- `is_platform_admin: Boolean` is a **separate cross-tenant flag**, independent of the org role

---

## 4. API Routes

**Entry point:** `packages/backend/src/routes/v1.ts` — all routes prefixed under `/api/v1`

| Domain            | Prefix          | File(s)                                                               | Auth Guard                             |
| ----------------- | --------------- | --------------------------------------------------------------------- | -------------------------------------- |
| **Auth (public)** | `/public/auth`  | `signup`, `verify-email`, `password-reset`, `invite`                  | None (rate-limited)                    |
| **Auth (app)**    | `/app/auth`     | `login`, `refresh`, `logout`, `me`, `mfa`                             | `authenticate` on `me`; open on others |
| **Projects**      | `/projects`     | `projects/index.ts`, `tasks/index.ts`                                 | `authenticate`                         |
| **Sessions**      | `/sessions`     | `create`, `list`, `update`, `approve`, `edit`                         | `authenticate`                         |
| **Users**         | `/users`        | `users/index.ts`                                                      | `authenticate`                         |
| **Dashboard**     | `/dashboard`    | `team-summary.ts`                                                     | `authenticate`                         |
| **Screenshots**   | `/screenshots`  | `upload`, `confirm`, `list`, `file`                                   | `authenticate`                         |
| **Activity**      | `/activity`     | `sync.ts`                                                             | `authenticate`                         |
| **Offline Time**  | `/offline-time` | `offline-time.ts`                                                     | `authenticate`                         |
| **Integrations**  | `/integrations` | `connect`, `callback`, `list`, `delete`, `sync`, `jira-issues-search` | `authenticate`                         |
| **Reports**       | `/reports`      | `time`, `activity`, `export`                                          | `authenticate`                         |
| **Admin**         | `/admin`        | `users`, `settings`, `audit-log`, `streaks`, `analytics`, `agent`     | `authenticate` + role guards           |
| **Agent**         | `/agent`        | `agent/index.ts`                                                      | `verifyAgentToken` (separate bearer)   |
| **Platform**      | `/platform`     | `orgs`, `analytics`                                                   | `requirePlatformAdmin()`               |

---

## 5. Current Roles

### Defined Roles (strings, not enums)

**Source:** `packages/backend/src/lib/permissions.ts`

| Role            | Where Used                                 | What It Can Do                                                                                                          |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `"super_admin"` | First user created on signup (org founder) | Bypasses **all** `hasPermission()` checks; hidden from org peer lists; cannot be assigned as manager by non-super_admin |
| `"admin"`       | Invited/promoted users                     | All 10 named permissions                                                                                                |
| `"manager"`     | Invited/promoted users                     | `MANAGERS_ACCESS` + `OFFLINE_TIME_MANAGE_USER`; scoped to direct reports only                                           |
| `"employee"`    | Default for all invites                    | No permissions; can only access own data                                                                                |

**Platform level (cross-tenant):**

| Flag           | Field                             | What It Controls                        |
| -------------- | --------------------------------- | --------------------------------------- |
| Platform Admin | `User.is_platform_admin: Boolean` | `/platform/*` routes; cross-org queries |

### Current Permission Set (10 named permissions)

**Source:** `packages/backend/src/lib/permissions.ts` lines 8–21

```
settings.manage_ss_duration    → admin only
settings.manage_blur_delete    → admin only
settings.manage_advanced       → admin only
offline_time.manage_org        → admin only
offline_time.manage_user       → admin + manager
users.assign_manager           → admin only
users.suspend                  → admin only
users.role_set_manager         → admin only
users.role_set_admin           → admin only
managers.access                → admin + manager
```

### Where Roles Are Enforced

- **Route-level:** `requireRole('admin', 'super_admin')` in `preHandler` arrays
- **Handler-level:** `hasPermission(caller, Permission.X)` inline checks in admin route handlers
- **Data-scoping:** `userWhereVisibleToOrgPeers()`, `canAccessOrgUser()`, `managerScopedUserIds()`, `filterAccessibleUserIds()` in `permissions.ts`

---

## 6. What's Missing (RBAC Gaps)

### Schema-Level Gaps

| Gap                                | Detail                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **No enums**                       | `role`, `status`, `plan`, `approval_status` are all raw strings. No type enforcement at DB level — invalid values can silently exist. |
| **No `Role` table**                | Roles are hardcoded in application code. No ability to create custom roles per org or configure per-org permission sets.              |
| **No `Permission` table**          | Permissions are constants in a TypeScript file. No DB record of what permissions exist, so you can't query "what can this role do?"   |
| **No `RolePermission` join table** | Permission-to-role mapping is hardcoded in `ROLE_PERMISSIONS` object. Cannot be changed without a code deploy.                        |
| **No Team/Group model**            | The only grouping is manager → direct reports. No concept of teams, departments, or project-level roles.                              |
| **No project-level permissions**   | A manager or admin has the same access to all projects. No way to scope a manager to "Project A only".                                |

### Application-Level Gaps

| Gap                                       | Detail                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role baked into JWT**                   | `role` is signed into the JWT at login and only refreshed on new token. Role changes take up to the token expiry window to propagate — no immediate revocation.                                                               |
| **`super_admin` semantics are broken**    | `createOrgWithSuperAdmin()` in `lib/create-org-with-super-admin.ts` creates a user with `role = "admin"`, not `"super_admin"`. The org founder is admin, not super_admin — the name is misleading and the intent is confused. |
| **Mixed enforcement patterns**            | Some routes use `requireRole()` middleware, others use inline `hasPermission()` inside the handler body, and some use neither. No single consistent pattern for "who can call this endpoint".                                 |
| **No permission check on Reports routes** | `/reports/time`, `/reports/activity`, `/reports/export` only require `authenticate` — no role gate. Any employee can query any report if they know the query params.                                                          |
| **No role check on `/integrations`**      | Any authenticated user can connect/delete org integrations. Should be admin-only.                                                                                                                                             |
| **No audit of permission denials**        | `AuditLog` captures successful admin actions but not rejected access attempts.                                                                                                                                                |
| **`is_platform_admin` not in JWT**        | The flag is looked up from DB/cache on every request but is never in the JWT. One off-path between JWT `role` (trusted blindly) and `is_platform_admin` (always DB-verified).                                                 |
| **No invite role validation**             | `Invite.role` is a free string. An admin could invite someone with `role = "super_admin"` by crafting a raw API call — there's no guard in the invite acceptance route.                                                       |
| **No per-user permission overrides**      | `can_add_offline_time` is the only user-level override flag. Everything else is purely role-based with no per-user exceptions.                                                                                                |
| **Manager scope not enforced on reports** | The reports routes filter by user-supplied `userIds` but don't uniformly enforce that a manager can only query their own direct reports.                                                                                      |

---

## 7. Infrastructure Needed for Full RBAC

To implement a proper role-based access control system, the following changes are required:

1. **Schema enums** — Convert `role`, `status`, `plan`, and `approval_status` from raw strings to Prisma enums for type safety and DB-level enforcement.

2. **Role consistency** — Decide whether `super_admin` means "org founder" or "highest privilege". Currently it means both inconsistently. `createOrgWithSuperAdmin()` should either be renamed or actually create a `super_admin`-role user.

3. **JWT role freshness** — Add role invalidation to the Redis blacklist (e.g. increment a `role_version` on the user and cache-bust on role change) so that role promotions/demotions take effect immediately.

4. **Consistent enforcement layer** — All routes should declare their required role/permission in `preHandler` — no inline `hasPermission` buried in handler bodies. Build a route permission matrix.

5. **Missing guards on Reports & Integrations** — Add `requireRole` guards to all `/reports/*` and `/integrations/connect|delete` routes.

6. **Invite role hardening** — Validate on invite creation and acceptance that the assigned `role` is within the set of roles the inviting user is allowed to grant (`admin` cannot invite `super_admin`).

7. **Manager scope on reports** — All report queries that accept `userIds` parameters must run the IDs through `filterAccessibleUserIds()` before querying.

8. **Optional: dynamic roles** — If per-org custom roles are needed, add `Role`, `Permission`, and `RolePermission` tables and migrate `ROLE_PERMISSIONS` from code into the DB.

9. **Optional: team model** — If group-based or project-scoped roles are needed, add a `Team` model and `UserTeam` join table.
