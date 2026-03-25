import { create } from 'zustand'

/** Strip Electron IPC wrapper so users see the real message. */
function unwrapIpcError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(/^Error invoking remote method '[^']+':\s*(.+)$/s)
  if (m?.[1]) {
    return m[1].replace(/^Error:\s*/i, '').trim()
  }
  return msg
}

export interface TimerSession {
  id: string
  startedAt: string
  projectId: string | null
  taskId: string | null
  notes: string | null
}

export interface LocalSessionRow {
  id: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  project_id: string | null
  task_id: string | null
  notes: string | null
  synced: number
}

interface TimerState {
  isRunning: boolean
  elapsedSeconds: number
  currentSession: TimerSession | null
  todaySessions: LocalSessionRow[]
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  start: (args: {
    projectId?: string | null
    taskId?: string | null
    notes?: string | null
  }) => Promise<void>
  stop: () => Promise<void>
  switchTask: (args: {
    projectId?: string | null
    taskId?: string | null
    notes?: string | null
  }) => Promise<void>
  refreshTodaySessions: () => Promise<void>
  setElapsed: (seconds: number) => void
  setError: (error: string | null) => void
  /** Clear timer UI state — call on sign-out so the next user never sees prior sessions. */
  reset: () => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  isRunning: false,
  elapsedSeconds: 0,
  currentSession: null,
  todaySessions: [],
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null })
    try {
      const status = (await window.electron?.ipcRenderer.invoke('timer:status')) as {
        running: boolean
        elapsed: number
        session: TimerSession | null
      }
      set({
        isRunning: status.running,
        elapsedSeconds: status.elapsed,
        currentSession: status.session,
      })
      await get().refreshTodaySessions()
    } catch (err) {
      set({ error: unwrapIpcError(err) || 'Failed to initialize timer' })
    } finally {
      set({ isLoading: false })
    }
  },

  start: async ({ projectId, taskId, notes }) => {
    set({ isLoading: true, error: null })
    try {
      const status = (await window.electron?.ipcRenderer.invoke('timer:start', {
        projectId: projectId ?? null,
        taskId: taskId ?? null,
        notes: notes ?? null,
      })) as { running: boolean; elapsed: number; session: TimerSession | null }
      set({
        isRunning: status.running,
        elapsedSeconds: status.elapsed,
        currentSession: status.session,
      })
      await get().refreshTodaySessions()
    } catch (err) {
      set({ error: unwrapIpcError(err) || 'Failed to start timer' })
    } finally {
      set({ isLoading: false })
    }
  },

  stop: async () => {
    set({ isLoading: true, error: null })
    try {
      await window.electron?.ipcRenderer.invoke('timer:stop')
      const sessions = (await window.electron?.ipcRenderer.invoke(
        'sessions:list-local'
      )) as LocalSessionRow[]
      set({
        isRunning: false,
        elapsedSeconds: 0,
        currentSession: null,
        todaySessions: sessions ?? [],
      })
    } catch (err) {
      set({ error: unwrapIpcError(err) || 'Failed to stop timer' })
    } finally {
      set({ isLoading: false })
    }
  },

  switchTask: async ({ projectId, taskId, notes }) => {
    set({ isLoading: true, error: null })
    try {
      const status = (await window.electron?.ipcRenderer.invoke('timer:switch-task', {
        projectId: projectId ?? null,
        taskId: taskId ?? null,
        notes: notes ?? null,
      })) as { running: boolean; elapsed: number; session: TimerSession | null }
      set({
        isRunning: status.running,
        elapsedSeconds: status.elapsed,
        currentSession: status.session,
      })
    } catch (err) {
      set({ error: unwrapIpcError(err) || 'Failed to switch task' })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshTodaySessions: async () => {
    try {
      const sessions = (await window.electron?.ipcRenderer.invoke(
        'sessions:list-local'
      )) as LocalSessionRow[]
      set({ todaySessions: sessions ?? [] })
    } catch {
      // silent
    }
  },

  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      isRunning: false,
      elapsedSeconds: 0,
      currentSession: null,
      todaySessions: [],
      isLoading: false,
      error: null,
    }),
}))

/** Format elapsed seconds as HH:MM:SS */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}
