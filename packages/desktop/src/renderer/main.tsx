import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'

// Apply stored theme immediately to avoid flash
;(function initTheme() {
  try {
    const stored = localStorage.getItem('tracksync-theme')
    const theme = stored === 'light' ? 'light' : 'dark'
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
      root.setAttribute('data-theme', 'dark')
    } else {
      root.classList.remove('dark')
      root.classList.add('light')
      root.setAttribute('data-theme', 'light')
    }
    // Sync Electron window background to hide title bar seam
    window.electron?.ipcRenderer.invoke('theme:set-background', theme)
  } catch {
    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (error: Error) => React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error)
    }
    return this.props.children
  }
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#08090d',
        color: '#f9fafb',
        fontFamily: 'system-ui',
      }}
    >
      <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
      <pre style={{ color: '#ef4444', fontSize: 12, overflow: 'auto', maxWidth: '100%' }}>
        {error.message}
      </pre>
      <p style={{ marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
        Press Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows) to open DevTools
      </p>
    </div>
  )
}

try {
  const root = document.getElementById('root')
  if (!root) throw new Error('Root element not found')
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider>
        <ErrorBoundary fallback={(e) => <ErrorFallback error={e} />}>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </React.StrictMode>
  )
} catch (err) {
  const div = document.createElement('div')
  div.style.cssText =
    'height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24;background:#08090d;color:#f9fafb;font-family:system-ui'
  const h2 = document.createElement('h2')
  h2.textContent = 'Failed to start'
  const pre = document.createElement('pre')
  pre.style.cssText = 'color:#ef4444;font-size:12'
  pre.textContent = (err as Error).message
  const p = document.createElement('p')
  p.style.cssText = 'margin-top:16;font-size:12;color:#9ca3af'
  p.textContent = 'Press Cmd+Option+I to open DevTools'
  div.append(h2, pre, p)
  document.body.replaceChildren(div)
}
