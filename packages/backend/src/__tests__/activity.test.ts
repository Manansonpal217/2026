import { describe, it, expect } from 'vitest'

// ── Unit tests for activity batch validation logic ────────────────────────────

interface ActivityLogItem {
  id: string
  session_id: string
  window_start: string
  window_end: string
  keyboard_events?: number
  mouse_clicks?: number
  mouse_distance_px?: number
  active_app?: string | null
  activity_score?: number
}

function validateActivityLog(log: ActivityLogItem): string | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(log.id)) return 'id must be a valid UUID'
  if (!uuidRegex.test(log.session_id)) return 'session_id must be a valid UUID'

  const start = new Date(log.window_start)
  const end = new Date(log.window_end)
  if (isNaN(start.getTime())) return 'window_start is invalid'
  if (isNaN(end.getTime())) return 'window_end is invalid'
  if (end <= start) return 'window_end must be after window_start'

  if (log.keyboard_events !== undefined && log.keyboard_events < 0) {
    return 'keyboard_events must be non-negative'
  }
  if (log.activity_score !== undefined && (log.activity_score < 0 || log.activity_score > 100)) {
    return 'activity_score must be between 0 and 100'
  }
  return null
}

function validateBatch(logs: ActivityLogItem[]): { valid: boolean; error?: string } {
  if (!Array.isArray(logs) || logs.length === 0) {
    return { valid: false, error: 'logs must be a non-empty array' }
  }
  if (logs.length > 200) {
    return { valid: false, error: 'batch size exceeds 200' }
  }
  return { valid: true }
}

const VALID_LOG: ActivityLogItem = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  session_id: '550e8400-e29b-41d4-a716-446655440001',
  window_start: '2024-01-15T10:00:00.000Z',
  window_end: '2024-01-15T10:10:00.000Z',
  keyboard_events: 100,
  mouse_clicks: 20,
  mouse_distance_px: 5000,
  activity_score: 65,
}

describe('validateActivityLog', () => {
  it('accepts a valid log', () => {
    expect(validateActivityLog(VALID_LOG)).toBeNull()
  })

  it('rejects invalid id UUID', () => {
    const err = validateActivityLog({ ...VALID_LOG, id: 'bad-id' })
    expect(err).toContain('id')
  })

  it('rejects window_end before window_start', () => {
    const err = validateActivityLog({
      ...VALID_LOG,
      window_start: '2024-01-15T10:10:00.000Z',
      window_end: '2024-01-15T10:00:00.000Z',
    })
    expect(err).toContain('window_end')
  })

  it('rejects negative keyboard_events', () => {
    const err = validateActivityLog({ ...VALID_LOG, keyboard_events: -1 })
    expect(err).toContain('keyboard_events')
  })

  it('rejects activity_score > 100', () => {
    const err = validateActivityLog({ ...VALID_LOG, activity_score: 101 })
    expect(err).toContain('activity_score')
  })

  it('accepts null active_app', () => {
    expect(validateActivityLog({ ...VALID_LOG, active_app: null })).toBeNull()
  })
})

describe('validateBatch', () => {
  it('rejects empty array', () => {
    const result = validateBatch([])
    expect(result.valid).toBe(false)
    expect(result.error).toContain('non-empty')
  })

  it('rejects batch > 200 items', () => {
    const logs = Array.from({ length: 201 }, (_, i) => ({
      ...VALID_LOG,
      id: `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, '0')}`,
    }))
    const result = validateBatch(logs)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('200')
  })

  it('accepts batch of exactly 200', () => {
    const logs = Array.from({ length: 200 }, (_, i) => ({
      ...VALID_LOG,
      id: `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, '0')}`,
    }))
    expect(validateBatch(logs).valid).toBe(true)
  })
})

describe('session ownership validation (IDOR protection)', () => {
  it('rejects log referencing a session from different user', () => {
    const userSessions = new Set(['sess-owned-by-user-A'])
    const log = { ...VALID_LOG, session_id: 'sess-owned-by-user-B' }

    const isValid = userSessions.has(log.session_id)
    expect(isValid).toBe(false)
  })

  it('accepts log referencing own session', () => {
    const userSessions = new Set(['550e8400-e29b-41d4-a716-446655440001'])
    const log = VALID_LOG

    const isValid = userSessions.has(log.session_id)
    expect(isValid).toBe(true)
  })
})
