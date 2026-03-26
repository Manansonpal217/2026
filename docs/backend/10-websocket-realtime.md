# Backend Module 10 — WebSocket & Real-Time

**Stack:** Node.js + Socket.io + Redis (pub/sub) + Fastify  
**Used by:** Desktop App (receive settings push, org status changes), Admin Panel (live dashboard)

---

## Overview

Maintains persistent WebSocket connections with all active desktop clients and (optionally) the web admin panel. Used to push settings changes, org suspension events, and session termination commands in real-time — no polling needed.

---

## Architecture

```
Backend (Socket.io + Redis adapter)
    ↕ WebSocket
Desktop App (Electron WebSocket client via Socket.io in renderer)

For multi-instance backend (ECS):
    Backend instance 1 ──┐
    Backend instance 2 ──┤──→ Redis Pub/Sub ──→ All instances broadcast to their clients
    Backend instance 3 ──┘
```

Redis adapter ensures that a message emitted on instance 1 reaches clients connected to instances 2 and 3.

---

## Socket Rooms

```typescript
// Each client joins multiple rooms on connect:
socket.join(`user:${userId}`) // events for specific user
socket.join(`org:${orgId}`) // events for entire org
socket.join(`role:${role}`) // events by role (rare)
```

---

## Connection & Authentication

```typescript
// Client sends auth on connect
socket.on('connect', () => {
  socket.emit('auth', { token: accessToken })
})

// Server-side middleware
io.use(async (socket, next) => {
  const { token } = socket.handshake.auth
  try {
    const payload = verifyJWT(token)
    const user = await getUser(payload.sub)
    socket.data.user = user
    socket.data.org_id = user.org_id
    socket.join(`user:${user.id}`)
    socket.join(`org:${user.org_id}`)
    next()
  } catch {
    next(new Error('UNAUTHORIZED'))
  }
})
```

---

## Events: Server → Desktop Client

### `settings:updated`

```typescript
// Emitted when Super Admin changes org settings
io.to(`org:${orgId}`).emit('settings:updated', {
  screenshots_enabled: false,
  screenshot_interval: 5,
  // ... only the changed fields
})

// Desktop app handler:
socket.on('settings:updated', (newSettings) => {
  mergeSettings(newSettings)
  applySettings()
})
```

### `org:suspended`

```typescript
io.to(`org:${orgId}`).emit('org:suspended', {
  reason: 'Non-payment',
  suspended_at: new Date().toISOString(),
})

// Desktop app: stops tracking, shows suspension screen, blocks all actions
```

### `org:reinstated`

```typescript
io.to(`org:${orgId}`).emit('org:reinstated', {})

// Desktop app: removes suspension screen, resumes normal operation
```

### `session:terminate`

```typescript
// Used when user is suspended or org is suspended mid-session
io.to(`user:${userId}`).emit('session:terminate', {
  reason: 'Account suspended',
})

// Desktop app: stops active timer, saves session to SQLite
```

---

## Events: Desktop Client → Server

### `heartbeat`

```typescript
// Desktop app sends every 30 seconds while tracking
socket.emit('heartbeat', {
  user_id: userId,
  has_active_session: true,
  session_id: activeSessionId,
})

// Server: update user.last_active_at, used for "active now" indicator in admin panel
```

---

## Events: Server → Admin Panel

### `org:activity_update`

```typescript
// Emitted every 30s to super admin / org admin dashboards
io.to(`org_admin:${orgId}`).emit('activity_update', {
  active_users: 12,
  users_tracking_now: [{ user_id, name, task_title, elapsed_seconds }],
})
```

---

## Connection Tracking (Redis)

```typescript
// On connect: mark user as online
await redis.sadd(`org:${orgId}:online_users`, userId)
await redis.expire(`org:${orgId}:online_users`, 3600)

// On disconnect: remove
socket.on('disconnect', () => {
  redis.srem(`org:${orgId}:online_users`, userId)
})

// Query: who is online in an org right now?
const onlineUsers = await redis.smembers(`org:${orgId}:online_users`)
```

---

## Reconnection (Desktop Client)

```typescript
// Electron renderer — Socket.io client (socket.io-client npm package)
const socket = io('wss://api.tracksync.io', {
  auth: { token: getAccessToken() },
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: Infinity,
})

socket.on('disconnect', () => {
  // On reconnect: re-fetch full org settings (may have changed while offline)
})

socket.on('connect', () => {
  syncOrgSettings()
})
```

---

## Redis Pub/Sub (Multi-Instance)

```typescript
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({ url: process.env.REDIS_URL })
const subClient = pubClient.duplicate()

await Promise.all([pubClient.connect(), subClient.connect()])
io.adapter(createAdapter(pubClient, subClient))

// Now: io.to('org:xyz').emit(...) works across all backend instances
```

---

## Latency Target

| Event                             | Expected Latency       |
| --------------------------------- | ---------------------- |
| Settings change → desktop applies | < 500ms                |
| Org suspended → desktop locked    | < 1 second             |
| Heartbeat interval                | 30 seconds             |
| Reconnect after network drop      | 2–30 seconds (backoff) |
