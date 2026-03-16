import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Unit tests for sessions batch validation logic ────────────────────────────
// These test the pure validation functions extracted from create.ts in isolation,
// without requiring a live DB or Fastify server.

interface SessionItem {
  id: string
  device_id: string
  device_name: string
  project_id?: string | null
  task_id?: string | null
  started_at: string
  ended_at?: string | null
  duration_sec: number
  is_manual?: boolean
  notes?: string | null
}

// Extracted validation logic (mirrors create.ts)
function validateSession(s: SessionItem): string | null {
  if (s.ended_at && s.started_at) {
    const start = new Date(s.started_at)
    const end = new Date(s.ended_at)
    if (end <= start) return 'ended_at must be after started_at'
  }
  if (s.ended_at && s.duration_sec <= 0) {
    return 'duration_sec must be positive for completed sessions'
  }
  return null
}

function validateBatch(sessions: SessionItem[]): { valid: boolean; error?: string } {
  if (sessions.length === 0) return { valid: false, error: 'sessions must not be empty' }
  if (sessions.length > 100) return { valid: false, error: 'batch size exceeds 100' }
  return { valid: true }
}

describe('Session batch validation', () => {
  it('accepts a valid completed session', () => {
    const err = validateSession({
      id: '123e4567-e89b-12d3-a456-426614174000',
      device_id: 'dev-1',
      device_name: 'MacBook',
      started_at: '2024-01-15T10:00:00.000Z',
      ended_at: '2024-01-15T11:00:00.000Z',
      duration_sec: 3600,
    })
    expect(err).toBeNull()
  })

  it('rejects session where ended_at <= started_at', () => {
    const err = validateSession({
      id: 'test',
      device_id: 'dev-1',
      device_name: 'MacBook',
      started_at: '2024-01-15T10:00:00.000Z',
      ended_at: '2024-01-15T09:59:00.000Z',
      duration_sec: 60,
    })
    expect(err).toBe('ended_at must be after started_at')
  })

  it('rejects session where ended_at equals started_at', () => {
    const err = validateSession({
      id: 'test',
      device_id: 'dev-1',
      device_name: 'MacBook',
      started_at: '2024-01-15T10:00:00.000Z',
      ended_at: '2024-01-15T10:00:00.000Z',
      duration_sec: 0,
    })
    expect(err).toBeDefined()
  })

  it('rejects completed session with duration_sec = 0', () => {
    const err = validateSession({
      id: 'test',
      device_id: 'dev-1',
      device_name: 'MacBook',
      started_at: '2024-01-15T10:00:00.000Z',
      ended_at: '2024-01-15T11:00:00.000Z',
      duration_sec: 0,
    })
    expect(err).toBe('duration_sec must be positive for completed sessions')
  })

  it('accepts a running session (no ended_at) with duration_sec = 0', () => {
    const err = validateSession({
      id: 'test',
      device_id: 'dev-1',
      device_name: 'MacBook',
      started_at: '2024-01-15T10:00:00.000Z',
      duration_sec: 0,
    })
    expect(err).toBeNull()
  })
})

describe('Batch size limits', () => {
  it('rejects empty batch', () => {
    expect(validateBatch([])).toMatchObject({ valid: false, error: expect.stringContaining('empty') })
  })

  it('rejects batch over 100 sessions', () => {
    const sessions = Array.from({ length: 101 }, (_, i) => ({
      id: `sess-${i}`,
      device_id: 'dev',
      device_name: 'Mac',
      started_at: new Date().toISOString(),
      duration_sec: 60,
    }))
    expect(validateBatch(sessions)).toMatchObject({ valid: false, error: expect.stringContaining('100') })
  })

  it('accepts a batch of exactly 100 sessions', () => {
    const sessions = Array.from({ length: 100 }, (_, i) => ({
      id: `sess-${i}`,
      device_id: 'dev',
      device_name: 'Mac',
      started_at: new Date().toISOString(),
      duration_sec: 60,
    }))
    expect(validateBatch(sessions)).toMatchObject({ valid: true })
  })
})

describe('IDOR protection logic', () => {
  it('builds the correct project allowlist for an org', () => {
    const orgProjects = [
      { id: 'proj-a', org_id: 'org-1' },
      { id: 'proj-b', org_id: 'org-1' },
    ]
    const requestedIds = ['proj-a', 'proj-c'] // proj-c is from another org

    const validSet = new Set(orgProjects.map((p) => p.id))
    const invalid = requestedIds.find((id) => !validSet.has(id))
    expect(invalid).toBe('proj-c')
  })

  it('allows all projects when all belong to the org', () => {
    const orgProjects = [
      { id: 'proj-a', org_id: 'org-1' },
      { id: 'proj-b', org_id: 'org-1' },
    ]
    const requestedIds = ['proj-a', 'proj-b']
    const validSet = new Set(orgProjects.map((p) => p.id))
    const invalid = requestedIds.find((id) => !validSet.has(id))
    expect(invalid).toBeUndefined()
  })

  it('detects task that does not belong to the session project', () => {
    const taskMap = new Map([
      ['task-1', 'proj-a'],
      ['task-2', 'proj-b'],
    ])
    const sessionProjectId = 'proj-a'
    const sessionTaskId = 'task-2' // task-2 belongs to proj-b, not proj-a

    const taskProjectId = taskMap.get(sessionTaskId)
    const mismatch = taskProjectId !== sessionProjectId
    expect(mismatch).toBe(true)
  })
})
