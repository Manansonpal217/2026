import { AGENT_VERSION } from './tracksync.js'
import { log } from './logger.js'

export interface HeartbeatState {
  lastSyncAt: string | null
  lastSyncCount: number
}

export interface HeartbeatOptions {
  apiUrl: string
  token: string
  getState: () => HeartbeatState
  intervalMs?: number
}

export function startHeartbeat(options: HeartbeatOptions): () => void {
  const { apiUrl, token, getState } = options
  const intervalMs = options.intervalMs ?? 60_000
  const url = `${apiUrl}/heartbeat`

  const tick = async () => {
    const { lastSyncAt, lastSyncCount } = getState()
    const body = {
      agentVersion: AGENT_VERSION,
      status: 'online',
      lastSyncAt,
      lastSyncCount,
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        log.warn(`Heartbeat POST failed: ${res.status} ${text.slice(0, 200)}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn(`Heartbeat failed: ${msg}`)
    }
  }

  void tick()
  const id = setInterval(() => {
    void tick()
  }, intervalMs)

  return () => clearInterval(id)
}
