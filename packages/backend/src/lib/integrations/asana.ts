import type { IntegrationAdapter, AuthTokens, ExternalProject, ExternalTask, TimeEntry } from './adapter.js'
import { validateOutboundUrl } from './ssrf.js'

const ASANA_AUTH_URL = 'https://app.asana.com/-/oauth_authorize'
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token'
const ASANA_API_BASE = 'https://app.asana.com/api/1.0'

async function asanaFetch(
  url: string,
  auth: AuthTokens,
  options: RequestInit = {},
): Promise<Response> {
  validateOutboundUrl(url)
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export const asanaAdapter: IntegrationAdapter = {
  type: 'asana',
  displayName: 'Asana',

  oauthAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.ASANA_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    })
    return `${ASANA_AUTH_URL}?${params.toString()}`
  },

  async exchangeCode(code: string, redirectUri: string): Promise<AuthTokens> {
    validateOutboundUrl(ASANA_TOKEN_URL)
    const res = await fetch(ASANA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ASANA_CLIENT_ID ?? '',
        client_secret: process.env.ASANA_CLIENT_SECRET ?? '',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })
    if (!res.ok) throw new Error(`Asana token exchange failed: ${res.status}`)
    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      data?: { gid: string; workspaces?: Array<{ gid: string }> }
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
    }
  },

  async refreshTokens(existing: AuthTokens): Promise<AuthTokens> {
    if (!existing.refresh_token) throw new Error('No Asana refresh token')
    validateOutboundUrl(ASANA_TOKEN_URL)
    const res = await fetch(ASANA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ASANA_CLIENT_ID ?? '',
        client_secret: process.env.ASANA_CLIENT_SECRET ?? '',
        refresh_token: existing.refresh_token,
      }).toString(),
    })
    if (!res.ok) throw new Error(`Asana token refresh failed: ${res.status}`)
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? existing.refresh_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
    }
  },

  async fetchProjects(auth: AuthTokens, config: Record<string, unknown>): Promise<ExternalProject[]> {
    const workspaceGid = config.workspace_gid as string | undefined
    if (!workspaceGid) {
      // Fetch default workspace from me endpoint
      const meRes = await asanaFetch(`${ASANA_API_BASE}/users/me?opt_fields=workspaces`, auth)
      if (!meRes.ok) throw new Error(`Asana /users/me failed: ${meRes.status}`)
      const me = (await meRes.json()) as { data: { workspaces: Array<{ gid: string }> } }
      const wsGid = me.data.workspaces[0]?.gid
      if (!wsGid) throw new Error('No Asana workspace found')

      const res = await asanaFetch(
        `${ASANA_API_BASE}/workspaces/${wsGid}/projects?opt_fields=gid,name,color&limit=100`,
        auth,
      )
      if (!res.ok) throw new Error(`Asana fetchProjects failed: ${res.status}`)
      const data = (await res.json()) as { data: Array<{ gid: string; name: string; color?: string }> }
      return data.data.map((p) => ({ id: p.gid, name: p.name, color: p.color }))
    }

    const res = await asanaFetch(
      `${ASANA_API_BASE}/workspaces/${workspaceGid}/projects?opt_fields=gid,name,color&limit=100`,
      auth,
    )
    if (!res.ok) throw new Error(`Asana fetchProjects failed: ${res.status}`)
    const data = (await res.json()) as { data: Array<{ gid: string; name: string; color?: string }> }
    return data.data.map((p) => ({ id: p.gid, name: p.name, color: p.color }))
  },

  async fetchTasks(auth: AuthTokens, projectGid: string): Promise<ExternalTask[]> {
    const res = await asanaFetch(
      `${ASANA_API_BASE}/projects/${projectGid}/tasks?opt_fields=gid,name,completed,assignee,assignee.email&limit=100`,
      auth,
    )
    if (!res.ok) throw new Error(`Asana fetchTasks failed: ${res.status}`)
    const data = (await res.json()) as {
      data: Array<{ gid: string; name: string; completed: boolean; assignee?: { email?: string } | null }>
    }
    return data.data.map((t) => ({
      id: t.gid,
      name: t.name,
      status: t.completed ? 'closed' : 'open',
      assigneeEmail: t.assignee?.email ?? null,
    }))
  },

  async pushTimeEntry(auth: AuthTokens, entry: TimeEntry): Promise<void> {
    // Asana has no native time tracking — log as a task comment
    const taskGid = entry.taskExternalId.replace('asana:', '')
    const url = `${ASANA_API_BASE}/tasks/${taskGid}/stories`
    const durationMin = Math.round(entry.durationSec / 60)
    const res = await asanaFetch(url, auth, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          text: `⏱ Time logged by ${entry.userName}: ${durationMin}m. ${entry.notes}`.trim(),
        },
      }),
    })
    if (!res.ok) throw new Error(`Asana pushTimeEntry failed: ${res.status}`)
  },
}
