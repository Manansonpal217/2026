# Phase 4 — Integration Engine (Week 12–14)

## Goal

Admins can connect TrackSync to Jira and Asana via OAuth 2.0. Projects and tasks from those tools sync into TrackSync automatically via a BullMQ job. When an employee logs time, that time entry is optionally pushed back to the external tool. The plugin architecture is extensible — adding a new integration requires only a new adapter file. OAuth tokens are encrypted at rest with AWS KMS envelope encryption. All outbound HTTP calls use a circuit breaker to prevent cascading failures.

---

## Prerequisites

- Phase 2 complete: Projects and Tasks exist in PostgreSQL
- Phase 1 complete: Authentication + org structure
- AWS KMS key for integration secrets exists: `tracksync/integrations/oauth-tokens`
- `SSRF_ALLOWED_HOSTS` env var configured (allowlist of integration OAuth endpoints)

---

## Key Packages to Install

### Backend
```bash
pnpm add opossum                 # Circuit breaker
pnpm add @aws-sdk/client-kms
pnpm add axios                   # Outbound HTTP to external tools
pnpm add -D @types/opossum
```

---

## Database Migrations

```prisma
model Integration {
  id          String    @id @default(uuid())
  org_id      String
  type        String    // jira | asana | google_sheets | trello
  name        String
  status      String    @default("active")   // active | error | disconnected
  auth_data   Bytes                          // KMS-encrypted JSON blob
  kms_key_id  String                         // Which KMS key encrypted auth_data
  config      Json      @default("{}")       // { project_key, board_id, sheet_id, ... }
  last_sync_at DateTime?
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  organization    Organization @relation(fields: [org_id], references: [id])
  oauth_states    OAuthState[]
}

model OAuthState {
  id              String    @id @default(uuid())
  integration_id  String?
  org_id          String
  state           String    @unique @default(uuid())
  provider        String    // jira | asana
  redirect_uri    String
  used            Boolean   @default(false)   // single-use enforcement
  expires_at      DateTime
  created_at      DateTime  @default(now())

  integration     Integration? @relation(fields: [integration_id], references: [id])
}
```

Run:
```bash
pnpm prisma migrate dev --name phase-04-integrations
```

---

## Files to Create

| File | Description |
|------|------------|
| `src/routes/integrations/connect.ts` | OAuth initiation (generate state token) |
| `src/routes/integrations/callback.ts` | OAuth callback (exchange code, store tokens) |
| `src/routes/integrations/list.ts` | List org integrations |
| `src/routes/integrations/delete.ts` | Disconnect integration |
| `src/routes/integrations/sync.ts` | Trigger manual sync |
| `src/lib/integrations/adapter.ts` | `IntegrationAdapter` interface |
| `src/lib/integrations/jira.ts` | Jira adapter implementation |
| `src/lib/integrations/asana.ts` | Asana adapter implementation |
| `src/lib/integrations/registry.ts` | Map `type → adapter` |
| `src/lib/integrations/kms.ts` | `encryptAuthData`, `decryptAuthData` |
| `src/lib/integrations/ssrf.ts` | `validateOutboundUrl()` |
| `src/lib/integrations/circuitBreaker.ts` | `opossum` circuit breaker factory |
| `src/queues/workers/integrationSync.ts` | BullMQ worker: pull projects/tasks |
| `src/queues/workers/timeLogPush.ts` | BullMQ worker: push time entries back |
| Web: `app/dashboard/integrations/page.tsx` | Integrations list UI |
| Web: `app/dashboard/integrations/[id]/page.tsx` | Integration detail + sync status |

---

## Backend Tasks

### Adapter Interface (`src/lib/integrations/adapter.ts`)

```typescript
export interface IntegrationAdapter {
  type: string
  displayName: string
  oauthAuthUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<AuthTokens>
  refreshTokens(existing: AuthTokens): Promise<AuthTokens>
  fetchProjects(auth: AuthTokens, config: Record<string, unknown>): Promise<ExternalProject[]>
  fetchTasks(auth: AuthTokens, projectId: string): Promise<ExternalTask[]>
  pushTimeEntry?(auth: AuthTokens, entry: TimeEntry): Promise<void>
}

export interface ExternalProject { id: string; name: string; color?: string }
export interface ExternalTask    { id: string; name: string; status: string }
export interface AuthTokens      { access_token: string; refresh_token?: string; expires_at?: number }
```

### Jira Adapter (`src/lib/integrations/jira.ts`)

- [ ] `oauthAuthUrl` — Jira OAuth 2.0 (3LO): `https://auth.atlassian.com/authorize?...`
- [ ] `exchangeCode` — `POST https://auth.atlassian.com/oauth/token`
- [ ] `refreshTokens` — refresh with `grant_type=refresh_token`
- [ ] `fetchProjects` — `GET https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/project`
- [ ] `fetchTasks` — `GET .../search?jql=project={key}` → map to `ExternalTask[]`
- [ ] `pushTimeEntry` — `POST .../worklog` on the Jira issue

### Asana Adapter (`src/lib/integrations/asana.ts`)

- [ ] `oauthAuthUrl` — `https://app.asana.com/-/oauth_authorize?...`
- [ ] `exchangeCode` — `POST https://app.asana.com/-/oauth_token`
- [ ] `fetchProjects` — `GET https://app.asana.com/api/1.0/workspaces/{workspace}/projects`
- [ ] `fetchTasks` — `GET .../projects/{gid}/tasks`
- [ ] `pushTimeEntry` — Asana doesn't have time tracking API natively; log as task comment

### KMS Encryption (`src/lib/integrations/kms.ts`)

- [ ] `encryptAuthData(plaintext: object): Promise<Buffer>`:
  ```typescript
  // 1. Generate data key: GenerateDataKey (returns plaintext key + encrypted key blob)
  // 2. Encrypt JSON with AES-256-GCM using plaintext key
  // 3. Concatenate: [encryptedDataKey(256 bytes) | iv(12) | authTag(16) | ciphertext]
  // 4. Store the concatenated buffer in Integration.auth_data
  ```

- [ ] `decryptAuthData(blob: Buffer): Promise<object>`:
  ```typescript
  // 1. Split buffer to extract encryptedDataKey, iv, authTag, ciphertext
  // 2. Decrypt data key: Decrypt(encryptedDataKey) → plaintext key
  // 3. AES-256-GCM decrypt ciphertext
  // 4. Return parsed JSON
  ```

### SSRF Protection (`src/lib/integrations/ssrf.ts`)

- [ ] `validateOutboundUrl(url: string): void`:
  - Parse URL
  - Reject: `localhost`, `127.0.0.1`, `169.254.x.x` (AWS metadata), `10.x.x.x`, `192.168.x.x`
  - Check host against `SSRF_ALLOWED_HOSTS` allowlist
  - Throw `403 ForbiddenHostError` if not allowed
  - Call this before every outbound HTTP request in the integration adapters

### Circuit Breaker (`src/lib/integrations/circuitBreaker.ts`)

```typescript
import CircuitBreaker from 'opossum'

const options = {
  timeout: 10_000,       // 10s per request
  errorThresholdPercentage: 50,  // open after 50% failure
  resetTimeout: 30_000   // retry after 30s
}

const breakers = new Map<string, CircuitBreaker>()

export function getBreaker(name: string, fn: Function): CircuitBreaker {
  if (!breakers.has(name)) breakers.set(name, new CircuitBreaker(fn, options))
  return breakers.get(name)!
}
```

### OAuth Flow

- [ ] `GET /v1/integrations/connect/:provider`
  ```
  Query:    ?redirect_uri=
  Response: { auth_url }
  ```
  - Create `OAuthState` record (single-use, 15 min expiry)
  - Return provider auth URL with `state` param

- [ ] `GET /v1/integrations/callback` (called by provider redirect)
  ```
  Query:    ?code=&state=&error=
  Response: redirect to /dashboard/integrations?connected=true (or error)
  ```
  - Find `OAuthState` by `state` — validate not used, not expired
  - Mark `used = true` immediately (single-use enforcement)
  - Exchange `code` for tokens
  - Encrypt tokens with KMS
  - Create or update `Integration` record
  - Enqueue first `integrationSync` job

- [ ] `GET /v1/integrations`
  ```
  Response: { integrations: [{ id, type, name, status, last_sync_at }] }
  Auth: admin+
  ```

- [ ] `DELETE /v1/integrations/:id`
  - Delete integration + soft-delete associated projects/tasks that came from this integration
  - Shred auth_data (zero out the blob)

- [ ] `POST /v1/integrations/:id/sync`
  - Enqueue `integrationSync` job immediately
  - Response: `{ queued: true, job_id }`

### BullMQ Worker: Integration Sync (`src/queues/workers/integrationSync.ts`)

- [ ] Job data: `{ integrationId, orgId }`
- [ ] Load integration, decrypt auth_data with KMS
- [ ] If tokens are expired, refresh via adapter → re-encrypt → update DB
- [ ] Wrap all outbound calls in circuit breaker
- [ ] Call `adapter.fetchProjects()` → upsert into `projects` (set `external_id`)
- [ ] For each project: call `adapter.fetchTasks()` → upsert into `tasks`
- [ ] Update `Integration.last_sync_at`, `status = 'active'`
- [ ] On error: set `status = 'error'`, log error message
- [ ] Job deduplication: `jobId = integrationSync:${integrationId}`

### BullMQ Worker: Time Log Push (`src/queues/workers/timeLogPush.ts`)

- [ ] Triggered when a session is approved (or immediately if no approval required)
- [ ] Job data: `{ sessionId, orgId }`
- [ ] Find integration by `org_id` + match `task.external_id` prefix to integration type
- [ ] Call `adapter.pushTimeEntry()` via circuit breaker
- [ ] On circuit breaker open: log warning, do NOT fail the session — degrade gracefully

---

## Desktop App Tasks

### Integration-Aware Task Picker

- [ ] `ProjectPicker.tsx` and `TaskPicker.tsx` should show integration source icon (Jira/Asana logo) if `task.external_id` is set
- [ ] "Sync" button in desktop app settings → calls `POST /v1/integrations/:id/sync` and refreshes project list

---

## Web Admin Panel Tasks

### Integrations Page (`app/dashboard/integrations/page.tsx`)

- [ ] List all integrations with status badge (active / error / disconnected)
- [ ] "Connect Jira" button → calls `GET /v1/integrations/connect/jira`, opens OAuth URL in browser
- [ ] "Connect Asana" button
- [ ] "Sync Now" button per integration → calls `POST /v1/integrations/:id/sync`
- [ ] "Disconnect" button with confirmation dialog

### Integration Detail (`app/dashboard/integrations/[id]/page.tsx`)

- [ ] Last sync time, synced project count, synced task count
- [ ] Error message if `status = 'error'`
- [ ] Config editor (e.g., select which Jira board to sync)

---

## Definition of Done

1. Admin connects Jira via OAuth — tokens stored in DB as encrypted blob (raw token never visible in DB)
2. `OAuthState` token is single-use — replaying the callback URL with same state returns 400
3. Jira projects and tasks appear in TrackSync within 5 minutes of connecting
4. Circuit breaker opens after 3 consecutive Jira API failures — TrackSync continues to work normally
5. SSRF protection blocks requests to `169.254.169.254` (AWS metadata endpoint)
6. Disconnecting an integration removes the auth data from DB
7. Time entry logged to a Jira task triggers a `timeLogPush` job that creates a Jira worklog
8. `integrationSync` job is deduplicated — clicking "Sync Now" twice doesn't create two workers
9. Admin panel integration page shows sync status and last sync time

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| KMS encrypt + decrypt round-trip | Unit | Vitest + KMS mock |
| `validateOutboundUrl` blocks private IPs | Unit | Vitest |
| OAuth state is single-use | Integration | Vitest |
| OAuth callback stores encrypted tokens | Integration | Vitest + DB |
| `integrationSync` job upserts projects | Integration | Vitest + mock adapter |
| Circuit breaker opens after failures | Unit | Vitest + fake clock |
| Circuit breaker half-open retries | Unit | Vitest |
| `DELETE /v1/integrations/:id` zeros auth_data | Integration | Vitest |
| Jira adapter `fetchProjects` maps correctly | Unit | Vitest |
| Asana adapter `fetchTasks` maps correctly | Unit | Vitest |
