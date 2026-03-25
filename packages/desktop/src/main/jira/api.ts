import log from 'electron-log'
import {
  getValidAccessToken,
  getJiraStore,
  disconnect,
  refreshAccessToken,
  setJiraMainWindowGetter,
} from './auth.js'
import type { BrowserWindow } from 'electron'

export interface JiraIssue {
  id: string
  key: string
  summary: string
  status: string
  priority: string | null
  project: string
  issueType: string
  url: string
}

async function jiraFetch(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

class JiraAuthError extends Error {
  constructor(public status: number) {
    super(`Jira API auth error: ${status}`)
  }
}

export async function getMyIssues(): Promise<JiraIssue[]> {
  const token = await getValidAccessToken()
  if (!token) {
    return []
  }

  const jira = getJiraStore().get('jira')
  if (!jira?.cloudId || !jira?.cloudUrl) {
    return []
  }

  const baseUrl = `https://api.atlassian.com/ex/jira/${jira.cloudId}/rest/api/3`
  const jql = encodeURIComponent(
    'assignee=currentUser() AND statusCategory != Done ORDER BY updated DESC'
  )
  const url = `${baseUrl}/search/jql?jql=${jql}&maxResults=50&fields=summary,status,priority,project,issuetype,assignee,updated`

  const doFetch = async (accessToken: string) => {
    const res = await jiraFetch(url, accessToken)
    if (res.status === 401) {
      throw new JiraAuthError(401)
    }
    if (!res.ok) {
      throw new Error(`Jira API error: ${res.status} ${await res.text()}`)
    }
    return res
  }

  let res: Response
  try {
    res = await doFetch(token)
  } catch (err) {
    if (err instanceof JiraAuthError) {
      try {
        const newToken = await refreshAccessToken()
        res = await doFetch(newToken)
      } catch (refreshErr) {
        log.error('[jira/api] Refresh failed on 401:', refreshErr)
        await disconnect(true)
        throw err
      }
    } else {
      log.error('[jira/api] getMyIssues failed:', err)
      throw err
    }
  }

  const data = (await res.json()) as {
    issues?: Array<{
      id: string
      key: string
      fields: {
        summary?: string
        status?: { name: string }
        priority?: { name: string } | null
        project?: { name: string }
        issuetype?: { name: string }
      }
    }>
  }

  const issues = data.issues ?? []
  return issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary ?? '',
    status: issue.fields.status?.name ?? 'Unknown',
    priority: issue.fields.priority?.name ?? null,
    project: issue.fields.project?.name ?? 'Unknown',
    issueType: issue.fields.issuetype?.name ?? 'Unknown',
    url: `${jira.cloudUrl}/browse/${issue.key}`,
  }))
}

export async function logWork(
  issueKey: string,
  timeSpentSeconds: number,
  description: string
): Promise<unknown> {
  const token = await getValidAccessToken()
  if (!token) {
    throw new Error('Not connected to Jira')
  }

  const jira = getJiraStore().get('jira')
  if (!jira?.cloudId) {
    throw new Error('Jira cloud not configured')
  }

  const url = `https://api.atlassian.com/ex/jira/${jira.cloudId}/rest/api/3/issue/${issueKey}/worklog`
  const body = {
    timeSpentSeconds,
    comment: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }],
        },
      ],
    },
  }

  const doPost = async (accessToken: string) => {
    const res = await jiraFetch(url, accessToken, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (res.status === 401) {
      throw new JiraAuthError(401)
    }
    if (!res.ok) {
      throw new Error(`Jira worklog failed: ${res.status} ${await res.text()}`)
    }
    return res.json()
  }

  try {
    return await doPost(token)
  } catch (err) {
    if (err instanceof JiraAuthError) {
      try {
        const newToken = await refreshAccessToken()
        return await doPost(newToken)
      } catch (refreshErr) {
        log.error('[jira/api] Refresh failed on 401 (logWork):', refreshErr)
        await disconnect(true)
      }
      throw err
    }
    log.error('[jira/api] logWork failed:', err)
    throw err
  }
}

export function initJiraApi(getMainWindow: () => BrowserWindow | null): void {
  setJiraMainWindowGetter(getMainWindow)
}
