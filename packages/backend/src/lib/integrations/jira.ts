import type {
  IntegrationAdapter,
  AuthTokens,
  ExternalProject,
  ExternalTask,
  TimeEntry,
} from './adapter.js'
import { validateOutboundUrl } from './ssrf.js'

const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize'
const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
const JIRA_API_BASE = 'https://api.atlassian.com/ex/jira'

async function jiraFetch(
  url: string,
  auth: AuthTokens,
  options: RequestInit = {}
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

async function getCloudId(auth: AuthTokens): Promise<string> {
  const res = await jiraFetch('https://api.atlassian.com/oauth/token/accessible-resources', auth)
  if (!res.ok) throw new Error(`Failed to get Jira cloud resources: ${res.status}`)
  const resources = (await res.json()) as Array<{ id: string; name: string }>
  if (!resources[0]) throw new Error('No Jira cloud resources found')
  return resources[0].id
}

export const jiraAdapter: IntegrationAdapter = {
  type: 'jira',
  displayName: 'Jira',

  oauthAuthUrl(state: string, redirectUri: string, codeChallenge?: string): string {
    const clientId = process.env.JIRA_CLIENT_ID ?? ''
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: 'read:jira-work write:jira-work offline_access',
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
    })
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge)
      params.set('code_challenge_method', 'S256')
    }
    return `${JIRA_AUTH_URL}?${params.toString()}`
  },

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<AuthTokens> {
    validateOutboundUrl(JIRA_TOKEN_URL)
    const body: Record<string, string | undefined> = {
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }
    if (codeVerifier) body.code_verifier = codeVerifier

    const res = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Jira token exchange failed: ${res.status}`)
    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
    }
  },

  async refreshTokens(existing: AuthTokens): Promise<AuthTokens> {
    if (!existing.refresh_token) throw new Error('No refresh token available')
    validateOutboundUrl(JIRA_TOKEN_URL)
    const res = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token: existing.refresh_token,
      }),
    })
    if (!res.ok) throw new Error(`Jira token refresh failed: ${res.status}`)
    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? existing.refresh_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
    }
  },

  async fetchProjects(auth: AuthTokens): Promise<ExternalProject[]> {
    const cloudId = await getCloudId(auth)
    const res = await jiraFetch(
      `${JIRA_API_BASE}/${cloudId}/rest/api/3/project?maxResults=50`,
      auth
    )
    if (!res.ok) throw new Error(`Jira fetchProjects failed: ${res.status}`)
    const data = (await res.json()) as Array<{
      id: string
      key: string
      name: string
      avatarUrls?: Record<string, string>
    }>
    return data.map((p) => ({ id: p.key, name: p.name }))
  },

  async fetchTasks(auth: AuthTokens, projectKey: string): Promise<ExternalTask[]> {
    const cloudId = await getCloudId(auth)
    const jql = encodeURIComponent(`project=${projectKey} ORDER BY updated DESC`)
    const res = await jiraFetch(
      `${JIRA_API_BASE}/${cloudId}/rest/api/3/search?jql=${jql}&fields=summary,status,assignee&maxResults=100`,
      auth
    )
    if (!res.ok) throw new Error(`Jira fetchTasks failed: ${res.status}`)
    const data = (await res.json()) as {
      issues: Array<{
        id: string
        key: string
        fields: {
          summary: string
          status: { name: string }
          assignee?: { emailAddress?: string } | null
        }
      }>
    }
    return data.issues.map((i) => ({
      id: i.key,
      name: i.fields.summary,
      status: i.fields.status.name.toLowerCase() === 'done' ? 'closed' : 'open',
      assigneeEmail: i.fields.assignee?.emailAddress ?? null,
    }))
  },

  async pushTimeEntry(auth: AuthTokens, entry: TimeEntry): Promise<void> {
    const cloudId = await getCloudId(auth)
    const issueKey = entry.taskExternalId.replace('jira:', '')
    const url = `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueKey}/worklog`
    validateOutboundUrl(url)
    const res = await jiraFetch(url, auth, {
      method: 'POST',
      body: JSON.stringify({
        timeSpentSeconds: entry.durationSec,
        started: entry.startedAt.replace('Z', '+0000').replace(/\.\d+/, '.000'),
        comment: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: entry.notes || `Logged by ${entry.userName}` }],
            },
          ],
        },
      }),
    })
    if (!res.ok) throw new Error(`Jira pushTimeEntry failed: ${res.status}`)
  },
}
