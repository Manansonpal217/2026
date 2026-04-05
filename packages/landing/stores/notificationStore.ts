import { create } from 'zustand'
import { api } from '@/lib/api'

export type AppNotification = {
  id: string
  org_id: string
  type: string
  payload: unknown
  read_at: string | null
  created_at: string
}

type NotificationState = {
  notifications: AppNotification[]
  unreadCount: number
  hydrated: boolean
  hydrate: () => Promise<void>
  addNotification: (n: AppNotification) => void
  markRead: (id: string) => void
  markAllRead: () => void
  setNotifications: (ns: AppNotification[]) => void
}

function countUnread(ns: AppNotification[]): number {
  return ns.filter((n) => !n.read_at).length
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const { data } = await api.get<{ notifications: AppNotification[] }>('/v1/app/notifications')
      const ns = data.notifications ?? []
      set({ notifications: ns, unreadCount: countUnread(ns), hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

  addNotification: (n) => {
    set((s) => {
      const exists = s.notifications.some((x) => x.id === n.id)
      if (exists) return s
      const next = [n, ...s.notifications].slice(0, 100)
      return { notifications: next, unreadCount: countUnread(next) }
    })
  },

  markRead: (id) => {
    set((s) => {
      const next = s.notifications.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
      return { notifications: next, unreadCount: countUnread(next) }
    })
    api.patch(`/v1/app/notifications/${id}/read`).catch(() => {})
  },

  markAllRead: () => {
    const now = new Date().toISOString()
    set((s) => {
      const next = s.notifications.map((n) => (n.read_at ? n : { ...n, read_at: now }))
      return { notifications: next, unreadCount: 0 }
    })
  },

  setNotifications: (ns) => {
    set({ notifications: ns, unreadCount: countUnread(ns) })
  },
}))
