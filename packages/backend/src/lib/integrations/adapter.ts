export interface ExternalProject {
  id: string
  name: string
  color?: string
}

export interface ExternalTask {
  id: string
  name: string
  status: string
  assigneeEmail?: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token?: string
  expires_at?: number
}

export interface TimeEntry {
  sessionId: string
  taskExternalId: string
  durationSec: number
  startedAt: string
  notes: string
  userName: string
}

export interface IntegrationAdapter {
  type: string
  displayName: string
  oauthAuthUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<AuthTokens>
  refreshTokens(existing: AuthTokens): Promise<AuthTokens>
  fetchProjects(auth: AuthTokens, config: Record<string, unknown>): Promise<ExternalProject[]>
  fetchTasks(auth: AuthTokens, projectExternalId: string): Promise<ExternalTask[]>
  pushTimeEntry?(auth: AuthTokens, entry: TimeEntry): Promise<void>
}
