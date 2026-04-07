'use client'

import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react'

const STORAGE_KEY = 'tracksync-sidebar-collapsed'

function persistCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    /* noop */
  }
}

type SidebarCtx = {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarCtx | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === '0') setCollapsedState(false)
        else if (stored === '1') setCollapsedState(true)
      }
    } catch {
      /* noop */
    }
    setReady(true)
  }, [])

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v)
    persistCollapsed(v)
  }, [])

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      persistCollapsed(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ collapsed: ready ? collapsed : true, setCollapsed, toggle }),
    [collapsed, ready, setCollapsed, toggle]
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar(): SidebarCtx {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    return {
      collapsed: true,
      setCollapsed: () => {},
      toggle: () => {},
    }
  }
  return ctx
}
