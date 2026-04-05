import type { ServerResponse } from 'node:http'

/** In-process SSE connections per user (multiple tabs). Replace with Redis pub/sub if multi-instance. */
const connections = new Map<string, Set<ServerResponse>>()

export function registerSSE(userId: string, res: ServerResponse, onDisconnect?: () => void): void {
  let set = connections.get(userId)
  if (!set) {
    set = new Set()
    connections.set(userId, set)
  }
  set.add(res)
  res.once('close', () => {
    onDisconnect?.()
    removeSSE(userId, res)
  })
}

export function removeSSE(userId: string, res: ServerResponse): void {
  const set = connections.get(userId)
  if (!set) return
  set.delete(res)
  if (set.size === 0) {
    connections.delete(userId)
  }
}

/**
 * Push an SSE event to all connections for the user.
 * Format: event name + data line with JSON body (SSE spec).
 */
export function sendSSE(userId: string, event: string, data: unknown): void {
  const set = connections.get(userId)
  if (!set || set.size === 0) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of set) {
    if (res.writableEnded) continue
    try {
      res.write(payload)
    } catch {
      removeSSE(userId, res)
    }
  }
}

/** Test / diagnostics: number of users with at least one open SSE connection. */
export function sseConnectedUserCount(): number {
  return connections.size
}
