import { randomBytes } from 'crypto'
import * as keytar from 'keytar'
import log from 'electron-log'
import { shell } from 'electron'
import type { BrowserWindow } from 'electron'

const SERVICE = 'trackysnc'
const ASANA_ACCESS = 'asana_access_token'
const ASANA_REFRESH = 'asana_refresh_token'

const AUTH_URL = 'https://app.asana.com/-/oauth_authorize'
const TOKEN_URL = 'https://app.asana.com/-/oauth_token'

let getMainWindow: (() => BrowserWindow | null) | null = null

let pendingOAuthResolve: ((result: { success: boolean; error?: string }) => void) | null = null
let pendingOAuthState: string | null = null

export function setAsanaMainWindowGetter(getter: () => BrowserWindow | null): void {
  getMainWindow = getter
}

function emitAsanaAuthLost(): void {
  getMainWindow?.()?.webContents.send('asana:auth-lost')
}

function generateRandomState(): string {
  return randomBytes(32).toString('hex')
}

export function handleAsanaProtocolUrl(url: string): boolean {
  if (!url.startsWith('tracksync://oauth/asana/callback')) return false
  if (!pendingOAuthResolve || !pendingOAuthState) {
    log.warn('[asana/auth] Protocol URL received but no pending OAuth flow')
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
      log.error('[asana/auth] OAuth error via protocol:', errorParam)
      resolve({ success: false, error: errorParam })
      return true
    }

    if (state !== expectedState) {
      log.error('[asana/auth] State mismatch via protocol')
      resolve({ success: false, error: 'Invalid state' })
      return true
    }

    if (!code) {
      resolve({ success: false, error: 'No authorization code' })
      return true
    }

    exchangeCodeForTokens(code)
      .then(() => resolve({ success: true }))
      .catch((err) => {
        log.error('[asana/auth] Token exchange failed:', err)
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Token exchange failed',
        })
      })
    return true
  } catch (err) {
    log.error('[asana/auth] Error parsing protocol URL:', err)
    if (pendingOAuthResolve) {
      pendingOAuthResolve({ success: false, error: 'Invalid callback URL' })
      pendingOAuthResolve = null
      pendingOAuthState = null
    }
    return true
  }
}

export async function startAsanaOAuthFlow(): Promise<{ success: boolean; error?: string }> {
  const clientId = process.env.ASANA_CLIENT_ID
  const clientSecret = process.env.ASANA_CLIENT_SECRET
  const redirectUri = process.env.ASANA_REDIRECT_URI || 'tracksync://oauth/asana/callback'

  if (!clientId || !clientSecret) {
    log.error('[asana/auth] Missing ASANA_CLIENT_ID or ASANA_CLIENT_SECRET')
    return { success: false, error: 'Asana integration not configured' }
  }

  const state = generateRandomState()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })
  const authUrl = `${AUTH_URL}?${params.toString()}`

  return new Promise((resolve) => {
    if (pendingOAuthResolve) {
      pendingOAuthResolve({ success: false, error: 'Another OAuth flow in progress' })
    }
    pendingOAuthState = state
    pendingOAuthResolve = resolve
    shell.openExternal(authUrl)
  })
}

async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.ASANA_CLIENT_ID
  const clientSecret = process.env.ASANA_CLIENT_SECRET
  const redirectUri = process.env.ASANA_REDIRECT_URI || 'tracksync://oauth/asana/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Asana integration not configured')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
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

  await keytar.setPassword(SERVICE, ASANA_ACCESS, data.access_token)
  if (data.refresh_token) {
    await keytar.setPassword(SERVICE, ASANA_REFRESH, data.refresh_token)
  }
}

export async function isAsanaConnected(): Promise<boolean> {
  const access = await keytar.getPassword(SERVICE, ASANA_ACCESS)
  return !!access
}

export async function disconnectAsana(emitLost = false): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE, ASANA_ACCESS)
    await keytar.deletePassword(SERVICE, ASANA_REFRESH)
  } catch (err) {
    log.error('[asana/auth] Error clearing keytar:', err)
  }
  if (emitLost) emitAsanaAuthLost()
}
