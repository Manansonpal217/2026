# App Module 13 — Dark Mode (Desktop App + Web Panel)

**Platform:** Desktop App (Electron + React) + Web Admin Panel (Next.js) + Employee Portal (Next.js)  
**Priority:** UX — required for developer audience (primary user base)

---

## Overview

Developers live in dark mode. TrackSync's target user — software teams — expect dark mode as a baseline, not a feature. This module documents the implementation across both the desktop app and web panels.

---

## Desktop App — Dark Mode

### Implementation (Electron + React + TailwindCSS)

```typescript
// Theme options: 'light' | 'dark' | 'system'
// 'system' = follow OS preference (default)

// src/renderer/stores/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create()(
  persist(
    (set) => ({
      theme: 'system' as 'light' | 'dark' | 'system',
      setTheme: (theme: 'light' | 'dark' | 'system') => set({ theme }),
    }),
    { name: 'tracksync-theme' }
  )
)
```

```typescript
// src/renderer/components/ThemeProvider.tsx
import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()

  useEffect(() => {
    const root = document.documentElement

    function applyTheme(resolved: 'light' | 'dark') {
      root.classList.toggle('dark', resolved === 'dark')
    }

    if (theme === 'system') {
      // Use browser's matchMedia — works in Electron renderer (Chromium)
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(theme)
    }
  }, [theme])

  return <>{children}</>
}
```

> **How it works in Electron:** The renderer process runs in Chromium and has full access to `window.matchMedia`. When the OS theme changes, Chromium fires the `prefers-color-scheme` media query change event automatically — no Electron-specific API needed.

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class', // toggle via .dark class on <html>
  theme: {
    extend: {
      colors: {
        // Semantic color tokens — use these instead of gray-100, gray-800 etc.
        background: { DEFAULT: 'hsl(var(--background))', dark: 'hsl(var(--background-dark))' },
        surface: 'hsl(var(--surface))',
        muted: 'hsl(var(--muted))',
        primary: 'hsl(var(--primary))',
      },
    },
  },
}
```

```css
/* src/styles/globals.css */
:root {
  --background: 0 0% 100%; /* white */
  --surface: 0 0% 96%; /* very light gray */
  --muted: 0 0% 45%;
  --foreground: 222 84% 5%;
  --primary: 221 83% 53%; /* blue */
  --border: 214 32% 91%;
  --destructive: 0 84% 60%;
}

.dark {
  --background: 224 71% 4%; /* very dark navy */
  --surface: 222 47% 11%; /* dark surface */
  --muted: 215 20% 65%;
  --foreground: 213 31% 91%;
  --primary: 217 91% 60%;
  --border: 216 34% 17%;
  --destructive: 0 72% 51%;
}
```

---

## Web Admin Panel + Employee Portal — Dark Mode

### Implementation (Next.js 14 + next-themes)

```bash
npm install next-themes
```

```typescript
// app/providers.tsx
'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"       // adds .dark to <html>
      defaultTheme="system"   // follow OS preference
      enableSystem
      disableTransitionOnChange   // prevents flash during SSR hydration
    >
      {children}
    </ThemeProvider>
  )
}
```

```typescript
// Theme toggle component (in Settings and header)
'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: 'light', icon: <Sun />, label: 'Light' },
    { value: 'dark', icon: <Moon />, label: 'Dark' },
    { value: 'system', icon: <Monitor />, label: 'System' },
  ]
  return (
    <div className="flex gap-1 rounded-lg border p-1">
      {options.map(({ value, icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors
            ${theme === value ? 'bg-primary text-white' : 'text-muted hover:bg-surface'}`}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  )
}
```

---

## Settings Location

### Desktop App

```
Settings → Appearance
    ┌────────────────────────────────────┐
    │  Appearance                        │
    │                                    │
    │  Theme:  ○ Light  ● System  ○ Dark│
    │                                    │
    │  Accent: [Blue ▼]                 │
    └────────────────────────────────────┘
```

### Web Panels

Theme toggle in the top navigation bar (icon button) + Settings → Appearance page.

---

## Dark Mode Consistency Checklist

| Component             | Dark Mode                                                  |
| --------------------- | ---------------------------------------------------------- |
| Sidebar navigation    | ✅ Use `bg-surface` semantic token                         |
| Charts (Recharts)     | ✅ Override stroke and fill colors via theme context       |
| Modal overlays        | ✅ `bg-background/80 backdrop-blur`                        |
| Screenshot thumbnails | ✅ Dark border, `bg-surface` on load skeleton              |
| Activity heatmap      | ✅ Dark cells use `bg-primary/10` → `bg-primary/90`        |
| Toast notifications   | ✅ shadcn/ui Toaster respects dark class                   |
| Tables                | ✅ Alternate rows use `bg-surface` instead of `bg-gray-50` |
| Code blocks (docs)    | ✅ Always use `code` with `bg-surface` background          |

---

## Testing Dark Mode

```bash
# macOS: switch system dark mode from Terminal
osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to true'

# Playwright test
test('dark mode persists after restart', async ({ page }) => {
  await page.goto('/settings/appearance')
  await page.click('[data-testid="theme-dark"]')
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})
```
