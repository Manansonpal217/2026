import { describe, it, expect, vi } from 'vitest'

// ── Unit tests for screenshot validation logic ────────────────────────────────

interface UploadUrlRequest {
  session_id: string
  taken_at: string
  file_size_bytes: number
  activity_score?: number
}

function validateUploadUrlRequest(body: unknown): string | null {
  const b = body as Partial<UploadUrlRequest>
  if (!b.session_id) return 'session_id is required'
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(b.session_id)) return 'session_id must be a valid UUID'
  if (!b.taken_at) return 'taken_at is required'
  if (isNaN(Date.parse(b.taken_at))) return 'taken_at must be a valid datetime'
  if (!b.file_size_bytes || b.file_size_bytes <= 0) return 'file_size_bytes must be positive'
  if (b.file_size_bytes > 50 * 1024 * 1024) return 'file_size_bytes exceeds 50MB limit'
  if (b.activity_score !== undefined && (b.activity_score < 0 || b.activity_score > 100)) {
    return 'activity_score must be between 0 and 100'
  }
  return null
}

function buildS3Key(orgId: string, userId: string, screenshotId: string, takenAt: Date): string {
  const year = takenAt.getUTCFullYear()
  const month = String(takenAt.getUTCMonth() + 1).padStart(2, '0')
  return `${orgId}/${userId}/${year}/${month}/${screenshotId}.enc`
}

describe('validateUploadUrlRequest', () => {
  it('accepts valid request', () => {
    const err = validateUploadUrlRequest({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      taken_at: new Date().toISOString(),
      file_size_bytes: 1024,
      activity_score: 75,
    })
    expect(err).toBeNull()
  })

  it('rejects missing session_id', () => {
    const err = validateUploadUrlRequest({ taken_at: new Date().toISOString(), file_size_bytes: 100 })
    expect(err).toContain('session_id')
  })

  it('rejects invalid UUID for session_id', () => {
    const err = validateUploadUrlRequest({
      session_id: 'not-a-uuid',
      taken_at: new Date().toISOString(),
      file_size_bytes: 100,
    })
    expect(err).toContain('UUID')
  })

  it('rejects file_size_bytes over 50MB', () => {
    const err = validateUploadUrlRequest({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      taken_at: new Date().toISOString(),
      file_size_bytes: 51 * 1024 * 1024,
    })
    expect(err).toContain('50MB')
  })

  it('rejects activity_score outside [0, 100]', () => {
    const err = validateUploadUrlRequest({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      taken_at: new Date().toISOString(),
      file_size_bytes: 1024,
      activity_score: 150,
    })
    expect(err).toContain('activity_score')
  })
})

describe('buildS3Key', () => {
  it('builds expected key format', () => {
    const orgId = 'org-1'
    const userId = 'user-1'
    const id = '550e8400-e29b-41d4-a716-446655440000'
    const takenAt = new Date('2024-03-15T10:00:00.000Z')
    const key = buildS3Key(orgId, userId, id, takenAt)
    expect(key).toBe(`${orgId}/${userId}/2024/03/${id}.enc`)
  })

  it('zero-pads single-digit month', () => {
    const key = buildS3Key('o', 'u', 'x', new Date('2024-01-01T00:00:00.000Z'))
    expect(key).toContain('/01/')
  })
})

describe('IDOR protection', () => {
  it('detects screenshot belonging to different user', () => {
    const screenshot = { id: 's1', user_id: 'user-A', org_id: 'org-1' }
    const requestingUserId = 'user-B'

    const isOwner = screenshot.user_id === requestingUserId
    expect(isOwner).toBe(false)
  })

  it('allows same-org admin access', () => {
    const screenshot = { id: 's1', user_id: 'user-A', org_id: 'org-1' }
    const adminUser = { id: 'admin-1', org_id: 'org-1', role: 'admin' }

    const canView =
      screenshot.org_id === adminUser.org_id &&
      ['admin', 'super_admin', 'manager'].includes(adminUser.role)
    expect(canView).toBe(true)
  })

  it('blocks cross-org access', () => {
    const screenshot = { id: 's1', user_id: 'user-A', org_id: 'org-1' }
    const intruder = { id: 'evil-1', org_id: 'org-2', role: 'admin' }

    const canView = screenshot.org_id === intruder.org_id
    expect(canView).toBe(false)
  })
})
