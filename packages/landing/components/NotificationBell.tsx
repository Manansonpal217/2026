'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSSE } from '@/hooks/useSSE'
import type { AppNotification } from '@/stores/notificationStore'
import { NotificationCenter } from '@/components/NotificationCenter'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const { unreadCount, hydrate, addNotification } = useNotificationStore()
  const [centerOpen, setCenterOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const prevCount = useRef(unreadCount)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useSSE((evt) => {
    if (evt.type && evt.payload) {
      addNotification(evt.payload as AppNotification)
    }
  })

  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 1000)
      return () => clearTimeout(t)
    }
    prevCount.current = unreadCount
  }, [unreadCount])

  return (
    <>
      <button
        type="button"
        onClick={() => setCenterOpen(true)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white transition-transform',
              pulse && 'animate-[pulse_0.5s_ease-in-out_2]'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationCenter open={centerOpen} onClose={() => setCenterOpen(false)} />
    </>
  )
}
