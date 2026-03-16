export interface ActiveSession {
  id: string
  userId: string
  orgId: string
  deviceId: string
  deviceName: string
  startedAt: Date
  projectId: string | null
  taskId: string | null
  notes: string | null
  intervalId: ReturnType<typeof setInterval> | null
}

let activeSession: ActiveSession | null = null

export function getActiveSession(): ActiveSession | null {
  return activeSession
}

export function setActiveSession(session: ActiveSession | null): void {
  activeSession = session
}

export function getElapsedSeconds(): number {
  if (!activeSession) return 0
  return Math.floor((Date.now() - activeSession.startedAt.getTime()) / 1000)
}
