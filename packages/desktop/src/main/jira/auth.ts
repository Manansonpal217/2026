import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, shell } from 'electron'
import * as keytar from 'keytar'
import log from 'electron-log'
import type { BrowserWindow } from 'electron'

const JIRA_KEYTAR_SERVICE = 'trackysnc'
const JIRA_ACCESS_KEY = 'atlassian_access_token'
const JIRA_REFRESH_KEY = 'atlassian_refresh_token'

const AUTH_URL = 'https://auth.atlassian.com/authorize'
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources'

const SCOPES = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'].join(' ')

function generateRandomState(): string {
  return randomBytes(32).toString('hex')
}

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TrackSync</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0d12;color:#e5e7eb;"><div style="text-align:center;"><p style="font-size:24px;">✅ Trackysnc connected!</p><p style="color:#9ca3af;">You can close this tab.</p></div></body></html>`
const ERROR_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TrackSync</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0d12;color:#e5e7eb;"><div style="text-align:center;"><p style="font-size:24px;">❌ Connection failed.</p><p style="color:#9ca3af;">Please try again.</p></div></body></html>`

/** Built incrementally during OAuth; `isConnected` requires cloudId + tokens. */
interface JiraConfig {
  jira?: { cloudId?: string; cloudUrl?: string; expires_at?: number }
}

function getJiraConfigPath(): string {
  return join(app.getPath('userData'), 'jira-config.json')
}

function readJiraConfig(): JiraConfig {
  try {
    const path = getJiraConfigPath()
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8')) as JiraConfig
    }
  } catch {
    // ignore
  }
  return {}
}

function writeJiraConfig(config: JiraConfig): void {
  writeFileSync(getJiraConfigPath(), JSON.stringify(config), 'utf-8')
}

const jiraStore = {
  get: (key: 'jira') => readJiraConfig()[key],
  set: (key: 'jira', value: JiraConfig['jira']) => {
    const config = readJiraConfig()
    config[key] = value
    writeJiraConfig(config)
  },
  delete: (key: 'jira') => {
    const config = readJiraConfig()
    delete config[key]
    writeJiraConfig(config)
  },
}

let getMainWindow: (() => BrowserWindow | null) | null = null

let pendingOAuthResolve: ((result: { success: boolean; error?: string }) => void) | null = null
let pendingOAuthState: string | null = null

export function setJiraMainWindowGetter(getter: () => BrowserWindow | null): void {
  getMainWindow = getter
}

/** Jira tokens lost — do not use auth:session-expired (that logs the user out of TrackSync). */
function emitJiraAuthLost(): void {
  getMainWindow?.()?.webContents.send('jira:auth-lost')
}

function isLocalServerMode(redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri)
    return u.hostname === 'localhost' && u.port === '8080'
  } catch {
    return false
  }
}

export function handleJiraProtocolUrl(url: string): boolean {
  if (!url.startsWith('tracksync://oauth/callback')) return false
  if (!pendingOAuthResolve || !pendingOAuthState) {
    log.warn('[jira/auth] Protocol URL received but no pending OAuth flow')
    return false
  }
  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    const errorParam = parsed.searchParams.get('error')
    const expectedState = pendingOAuthState

    const resolve = pendingOAuthResolve
    pendingOAuthResolve = null
    pendingOAuthState = null

    if (errorParam) {
      log.error('[jira/auth] OAuth error via protocol:', errorParam)
      resolve({ success: false, error: errorParam })
      return true
    }

    if (state !== expectedState) {
      log.error('[jira/auth] State mismatch via protocol - possible CSRF')
      resolve({ success: false, error: 'Invalid state' })
      return true
    }

    if (!code) {
      log.error('[jira/auth] No code in protocol URL')
      resolve({ success: false, error: 'No authorization code' })
      return true
    }

    exchangeCodeForTokens(code)
      .then(() => resolve({ success: true }))
      .catch((err) => {
        log.error('[jira/auth] Token exchange failed via protocol:', err)
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Token exchange failed',
        })
      })
    return true
  } catch (err) {
    log.error('[jira/auth] Error parsing protocol URL:', err)
    if (pendingOAuthResolve) {
      pendingOAuthResolve({ success: false, error: 'Invalid callback URL' })
      pendingOAuthResolve = null
      pendingOAuthState = null
    }
    return true
  }
}

export async function startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
  const clientId = process.env.ATLASSIAN_CLIENT_ID
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || 'https://tracksync.dev/oauth/callback'

  if (!clientId || !clientSecret) {
    log.error('[jira/auth] Missing ATLASSIAN_CLIENT_ID or ATLASSIAN_CLIENT_SECRET')
    return { success: false, error: 'Jira integration not configured' }
  }

  const state = generateRandomState()
  const authUrl = `${AUTH_URL}?audience=api.atlassian.com&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&prompt=consent`

  if (isLocalServerMode(redirectUri)) {
    return runLocalServerFlow(authUrl, state)
  }

  return runProtocolFlow(authUrl, state, redirectUri)
}

async function runProtocolFlow(
  authUrl: string,
  state: string,
  _redirectUri: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (pendingOAuthResolve) {
      pendingOAuthResolve({ success: false, error: 'Another OAuth flow in progress' })
    }
    pendingOAuthState = state
    pendingOAuthResolve = resolve
    shell.openExternal(authUrl)
  })
}

async function runLocalServerFlow(
  authUrl: string,
  state: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost`)
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const errorParam = url.searchParams.get('error')

      if (errorParam) {
        log.error('[jira/auth] OAuth error:', errorParam)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        server.close()
        resolve({ success: false, error: errorParam })
        return
      }

      if (returnedState !== state) {
        log.error('[jira/auth] State mismatch - possible CSRF')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        server.close()
        resolve({ success: false, error: 'Invalid state' })
        return
      }

      if (!code) {
        log.error('[jira/auth] No code in callback')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        server.close()
        resolve({ success: false, error: 'No authorization code' })
        return
      }

      try {
        await exchangeCodeForTokens(code)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(SUCCESS_HTML)
        resolve({ success: true })
      } catch (err) {
        log.error('[jira/auth] Token exchange failed:', err)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Token exchange failed',
        })
      } finally {
        server.close()
      }
    })

    server.listen(8080, '127.0.0.1', () => {
      shell.openExternal(authUrl)
    })

    server.on('error', (err) => {
      log.error('[jira/auth] Callback server error:', err)
      resolve({ success: false, error: err instanceof Error ? err.message : 'Server error' })
    })
  })
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.ATLASSIAN_CLIENT_ID
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || 'https://tracksync.dev/oauth/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Jira integration not configured')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  await keytar.setPassword(JIRA_KEYTAR_SERVICE, JIRA_ACCESS_KEY, data.access_token)
  if (data.refresh_token) {
    await keytar.setPassword(JIRA_KEYTAR_SERVICE, JIRA_REFRESH_KEY, data.refresh_token)
  }

  const expires_at = data.expires_in
    ? Math.floor(Date.now() / 1000) + data.expires_in
    : Math.floor(Date.now() / 1000) + 3600

  const existing = jiraStore.get('jira') || {}
  jiraStore.set('jira', { ...existing, expires_at })

  await fetchCloudId(data.access_token)
}

export async function fetchCloudId(accessToken: string): Promise<void> {
  const res = await fetch(RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch cloud resources: ${res.status}`)
  }

  const resources = (await res.json()) as Array<{ id: string; url: string }>
  const first = resources[0]
  if (!first) {
    throw new Error('No Jira cloud resources found')
  }

  const existing = jiraStore.get('jira') || {}
  jiraStore.set('jira', {
    ...existing,
    cloudId: first.id,
    cloudUrl: first.url.replace(/\/$/, ''),
  })
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await keytar.getPassword(JIRA_KEYTAR_SERVICE, JIRA_REFRESH_KEY)
  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  const clientId = process.env.ATLASSIAN_CLIENT_ID
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Jira integration not configured')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  await keytar.setPassword(JIRA_KEYTAR_SERVICE, JIRA_ACCESS_KEY, data.access_token)
  if (data.refresh_token) {
    await keytar.setPassword(JIRA_KEYTAR_SERVICE, JIRA_REFRESH_KEY, data.refresh_token)
  }

  const expires_at = data.expires_in
    ? Math.floor(Date.now() / 1000) + data.expires_in
    : Math.floor(Date.now() / 1000) + 3600

  const existing = jiraStore.get('jira') || {}
  jiraStore.set('jira', { ...existing, expires_at })

  return data.access_token
}

export async function getValidAccessToken(): Promise<string | null> {
  const accessToken = await keytar.getPassword(JIRA_KEYTAR_SERVICE, JIRA_ACCESS_KEY)
  if (!accessToken) return null

  const jira = jiraStore.get('jira')
  if (!jira?.cloudId) return null

  const expiresAt = jira.expires_at ?? 0
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt - now > 60) {
    return accessToken
  }

  try {
    return await refreshAccessToken()
  } catch (err) {
    log.error('[jira/auth] Refresh failed:', err)
    await disconnect(true)
    return null
  }
}

export async function isConnected(): Promise<boolean> {
  const accessToken = await keytar.getPassword(JIRA_KEYTAR_SERVICE, JIRA_ACCESS_KEY)
  const jira = jiraStore.get('jira')
  return !!(accessToken && jira?.cloudId)
}

export async function disconnect(emitJiraAuthLostEvent = false): Promise<void> {
  try {
    await keytar.deletePassword(JIRA_KEYTAR_SERVICE, JIRA_ACCESS_KEY)
    await keytar.deletePassword(JIRA_KEYTAR_SERVICE, JIRA_REFRESH_KEY)
  } catch (err) {
    log.error('[jira/auth] Error clearing keytar:', err)
  }
  jiraStore.delete('jira')
  if (emitJiraAuthLostEvent) {
    emitJiraAuthLost()
  }
}

export function getJiraStore(): { get: (key: 'jira') => JiraConfig['jira'] } {
  return jiraStore
}
