# Backend Module 05 — Integration Engine

**Stack:** Node.js + Fastify + Prisma + BullMQ + PostgreSQL  
**Used by:** Org Admin Panel (connect), Desktop App (read projects/tasks), All Log Work endpoints

---

## Overview

Plugin-based integration system. Each external tool (Jira, Asana, Linear, etc.) is a self-contained plugin implementing a standard interface. Adding a new integration requires only dropping a new folder — zero changes to core code.

---

## Folder Structure

```
/integrations
  /core
    base-integration.ts      ← abstract class all plugins extend
    integration-factory.ts   ← loads correct plugin by slug
    sync-scheduler.ts        ← BullMQ jobs for periodic syncs
  /plugins
    /jira
      index.ts
      auth.ts                ← OAuth 2.0 flow
      projects.ts            ← fetchProjects()
      tasks.ts               ← fetchTasks()
      time-log.ts            ← logWork()
      webhooks.ts            ← handleWebhook()
    /asana
      index.ts
      auth.ts
      projects.ts
      tasks.ts
    /linear
      index.ts
      ...
    /github
      index.ts
      ...
    /google-sheets
      index.ts
      auth.ts
      time-log.ts            ← export to sheet
```

---

## Base Integration Interface

```typescript
abstract class BaseIntegration {
  abstract slug: string

  // Validate credentials — called when org admin connects
  abstract validateCredentials(authData: AuthData): Promise<boolean>

  // Fetch all accessible projects
  abstract fetchProjects(authData: AuthData, config: Config): Promise<Project[]>

  // Fetch tasks for a project (supports delta sync via since parameter)
  abstract fetchTasks(
    authData: AuthData,
    projectId: string,
    filters: { since?: Date; assignee?: string }
  ): Promise<Task[]>

  // Fetch users from the tool (for email mapping)
  abstract fetchUsers(authData: AuthData): Promise<ExternalUser[]>

  // Log work entry to the tool
  abstract logWork(authData: AuthData, payload: WorkLogPayload): Promise<WorkLogResult>

  // Handle incoming webhook event (optional)
  handleWebhook?(payload: WebhookPayload): Promise<void>

  // Return config fields needed in UI (e.g., "Jira domain")
  static getConfigSchema(): ConfigField[]

  // OAuth flow (optional — some use API key instead)
  getOAuthUrl?(state: string): string
  exchangeCode?(code: string): Promise<TokenPair>
  refreshToken?(refreshToken: string): Promise<TokenPair>
}
```

---

## Database Tables

```sql
integration_definitions
  id                UUID PRIMARY KEY
  name              VARCHAR
  slug              VARCHAR UNIQUE
  logo_url          VARCHAR
  auth_type         ENUM(oauth2, api_key, basic_auth, pat)
  is_active         BOOLEAN
  supports_projects BOOLEAN
  supports_tasks    BOOLEAN
  supports_time_log BOOLEAN
  supports_webhooks BOOLEAN
  config_schema     JSONB
  created_at        TIMESTAMP

org_integrations
  id                 UUID PRIMARY KEY
  org_id             UUID FK → organizations
  integration_def_id UUID FK → integration_definitions
  auth_data          JSONB ENCRYPTED    -- tokens, API keys
  extra_config       JSONB              -- domain, project filters
  status             ENUM(connected, disconnected, error)
  last_synced_at     TIMESTAMP
  error_message      TEXT
  connected_by       UUID FK → users
  created_at         TIMESTAMP
```

---

## Endpoints

### List Available Integrations

```typescript
GET / app / integrations / available
Response: [{ slug, name, logo_url, auth_type, config_schema }]
```

### Org Admin: Connect Integration (OAuth)

```typescript
GET /v1/admin/integrations/:slug/oauth/start
    → Generate state token: crypto.randomUUID()
    → Store in Redis with single-use flag:
        HSET oauth_state:<state> user_id <id> org_id <org_id> used false
        EXPIRE oauth_state:<state> 600   ← 10 minutes TTL
    → Redirect to provider OAuth URL (with state param)

GET /v1/admin/integrations/:slug/oauth/callback?code=&state=
    → Load state data: HGETALL oauth_state:<state>
    → If not found: 400 "Invalid or expired state"
    → If state.used = 'true': 400 "State token already used" ← PREVENTS CSRF REPLAY
    → IMMEDIATELY mark as used: HSET oauth_state:<state> used true
    → Exchange code for access_token + refresh_token
    → Store encrypted in org_integrations.auth_data
    → Trigger initial sync (BullMQ job)
    → Return: { status: 'connected' }
```

### SSRF Protection for Integration Domains

```typescript
import { isPrivateIP } from 'private-ip' // npm package: private-ip

async function validateIntegrationDomain(domain: string): Promise<void> {
  // 1. Parse URL
  let parsed: URL
  try {
    parsed = new URL(`https://${domain}`)
  } catch {
    throw new Error('Invalid domain format')
  }

  // 2. Block private/reserved IP ranges (RFC 1918 + loopback + link-local)
  // Resolve hostname to IP to prevent DNS rebinding
  const { address } = await dns.promises.lookup(parsed.hostname)
  if (isPrivateIP(address)) {
    throw new Error('Integration domain cannot point to a private IP address')
  }

  // 3. Block cloud metadata endpoints
  const BLOCKED_HOSTNAMES = [
    '169.254.169.254', // AWS/GCP/Azure instance metadata
    'metadata.google.internal',
    'metadata.gcp.internal',
  ]
  if (BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    throw new Error('Integration domain is not allowed')
  }

  // 4. Allowlist known provider domains (Starter plan: must match known pattern)
  const KNOWN_PROVIDERS: Record<string, RegExp> = {
    jira: /^[a-z0-9-]+\.atlassian\.net$/,
    asana: /^app\.asana\.com$/,
    linear: /^api\.linear\.app$/,
    github: /^api\.github\.com$/,
    clickup: /^api\.clickup\.com$/,
  }
  // Note: allowlist is advisory; the IP check is the security gate
}

// Called before any integration connection is stored
async function validateCredentials(slug: string, authData: AuthData): Promise<void> {
  if (authData.domain) {
    await validateIntegrationDomain(authData.domain)
  }
  const plugin = IntegrationFactory.create(slug)
  await plugin.validateCredentials(authData)
}
```

### Org Admin: Connect Integration (API Key)

```typescript
POST /admin/integrations/:slug/connect
Body: { api_key, domain?, extra_config? }

Action:
  1. Load plugin via integration-factory
  2. plugin.validateCredentials({ api_key, domain })
  3. If valid: create/update org_integrations row
  4. Trigger initial sync job
  5. Return: { status: 'connected' }
```

### Org Admin: Disconnect Integration

```typescript
DELETE /admin/integrations/:slug

Action:
  1. org_integrations.status = 'disconnected'
  2. Revoke tokens at provider (if OAuth)
  3. Projects + tasks remain in DB (historical)
```

### Org Admin: Sync Status

```typescript
GET /admin/integrations/:slug/sync-status
Response: { last_synced_at, status, error_message, projects_count, tasks_count }
```

### Desktop App: Fetch Assigned Projects

```typescript
GET /app/projects?since=<ISO_timestamp>

Action:
  1. Load org's connected integration
  2. If since provided: delta sync (only changed projects)
  3. Upsert into projects table
  4. Return only projects where employee is assigned
```

### Desktop App: Fetch Tasks for Project

```typescript
GET /app/projects/:id/tasks?since=<ISO_timestamp>

Action:
  1. Delta sync from integration if since is recent
  2. Return tasks assigned to current user
```

---

## Circuit Breaker for External API Calls

> External integration APIs (Jira, Asana, Linear) go down, rate-limit, or return errors. Without a circuit breaker, a single bad integration floods BullMQ with retries and could cause cascading failures across multiple orgs.

```typescript
import CircuitBreaker from 'opossum' // npm: opossum

// Create one circuit breaker per integration provider
const breakers: Map<string, CircuitBreaker> = new Map()

function getBreaker(providerSlug: string): CircuitBreaker {
  if (!breakers.has(providerSlug)) {
    const breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
      timeout: 10_000, // 10s timeout per API call
      errorThresholdPercentage: 50, // open if 50% of calls fail
      resetTimeout: 30_000, // try again after 30s (half-open state)
      volumeThreshold: 5, // need at least 5 calls to make decision
    })

    breaker.on('open', () => {
      logger.warn(`Circuit opened for integration provider: ${providerSlug}`)
      metrics.increment('integration.circuit_open', { provider: providerSlug })
    })

    breaker.on('halfOpen', () => {
      logger.info(`Circuit half-open, testing: ${providerSlug}`)
    })

    breaker.on('close', () => {
      logger.info(`Circuit closed, provider recovered: ${providerSlug}`)
    })

    breakers.set(providerSlug, breaker)
  }
  return breakers.get(providerSlug)!
}

// Usage in integration plugin:
async function callExternalApi(providerSlug: string, apiCall: () => Promise<any>) {
  const breaker = getBreaker(providerSlug)
  try {
    return await breaker.fire(apiCall)
  } catch (err) {
    if (err.message === 'Circuit breaker is open') {
      // Don't retry — provider is known down, fail fast
      throw new IntegrationProviderDownError(`${providerSlug} is temporarily unavailable`)
    }
    throw err
  }
}
```

## Sync Scheduler (BullMQ)

```typescript
// sync-scheduler.ts
// Runs every 15 minutes for all connected orgs

const syncQueue = new Queue('integration-sync')

// Schedule periodic syncs
cron.schedule('*/15 * * * *', async () => {
  const activeOrgs = await getOrgsWithActiveIntegrations()
  for (const org of activeOrgs) {
    await syncQueue.add(
      'sync-org',
      { orgId: org.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    )
  }
})

// Worker
const worker = new Worker('integration-sync', async (job) => {
  const { orgId } = job.data
  const org = await getOrgWithIntegration(orgId)
  const plugin = IntegrationFactory.create(org.integration.slug)
  const authData = decrypt(org.integration.auth_data)

  const projects = await plugin.fetchProjects(authData, org.integration.extra_config)
  await upsertProjects(orgId, projects)

  for (const project of projects) {
    const tasks = await plugin.fetchTasks(authData, project.external_id, {
      since: org.integration.last_synced_at,
    })
    await upsertTasks(orgId, tasks)
  }

  await mapExternalUsers(orgId, await plugin.fetchUsers(authData))
  await updateLastSynced(org.integration.id)
})
```

---

## Auth Data Encryption — AWS KMS Envelope Encryption

> **Why KMS envelope encryption?** Storing `AES_256_KEY` as a plain environment variable means if the server is compromised, all integration credentials are exposed. With envelope encryption, the plaintext data key never exists in long-term storage — it's generated fresh by KMS each time.

```typescript
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms'

const kms = new KMSClient({ region: process.env.AWS_REGION })
const KMS_KEY_ARN = process.env.KMS_MASTER_KEY_ARN // master key in AWS KMS

// ENCRYPT: called when storing integration credentials
async function encryptAuthData(plaintext: object): Promise<EncryptedBlob> {
  // 1. Ask KMS to generate a data key
  const { Plaintext: dataKey, CiphertextBlob: encryptedDataKey } = await kms.send(
    new GenerateDataKeyCommand({
      KeyId: KMS_KEY_ARN,
      KeySpec: 'AES_256',
    })
  )

  // 2. Encrypt the plaintext with the data key (in memory — data key never persisted)
  const encrypted = aesGcmEncrypt(Buffer.from(JSON.stringify(plaintext)), dataKey!)

  // 3. Store: encrypted data + encrypted data key (KMS encrypted)
  //    The plaintext data key is discarded after this function returns
  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    encrypted_data_key: Buffer.from(encryptedDataKey!).toString('base64'),
    key_version: 1, // increment on key rotation
  }
}

// DECRYPT: called before using integration credentials
async function decryptAuthData(blob: EncryptedBlob): Promise<object> {
  // 1. Ask KMS to decrypt the data key (KMS validates IAM permissions)
  const { Plaintext: dataKey } = await kms.send(
    new DecryptCommand({
      KeyId: KMS_KEY_ARN,
      CiphertextBlob: Buffer.from(blob.encrypted_data_key, 'base64'),
    })
  )

  // 2. Decrypt the actual data with the recovered data key
  const plaintext = aesGcmDecrypt(blob.ciphertext, blob.nonce, dataKey!)
  return JSON.parse(plaintext.toString())
}
```

### Schema Update for KMS

```sql
-- org_integrations auth_data column stores the full EncryptedBlob as JSONB:
-- {
--   ciphertext: "base64...",
--   nonce: "base64...",
--   encrypted_data_key: "base64...",  ← only KMS can decrypt this
--   key_version: 1
-- }
ALTER TABLE org_integrations ADD COLUMN key_version INT DEFAULT 1;
```

### Key Rotation Strategy

```
1. Create new KMS key version (or new KMS key alias)
2. Background job re-encrypts all org_integrations rows:
   - Decrypt with old key version
   - Re-encrypt with new key version
   - Update key_version column
3. Old key version can be disabled after all rows migrated
4. No downtime — rows with different key_version coexist during rotation
```

---

## Adding a New Integration

```
1. Create /integrations/plugins/notion/index.ts
2. Extend BaseIntegration, implement all abstract methods
3. INSERT INTO integration_definitions (...) VALUES (...)
4. Done — appears in Super Admin panel and org connect UI automatically
```

---

## Integration Priority Roadmap

| Phase         | Integrations                                  |
| ------------- | --------------------------------------------- |
| MVP (Phase 1) | Jira, Asana, Google Sheets                    |
| Phase 2       | GitHub Issues, Linear, Trello, Tempo, ClickUp |
| Phase 3       | Monday.com, Azure DevOps, Notion, Basecamp    |
