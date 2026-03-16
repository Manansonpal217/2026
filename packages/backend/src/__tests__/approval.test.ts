import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Approval workflow logic tests ─────────────────────────────────────────────
// These test the pure logic for session approval/rejection without a live DB.

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'draft'

interface Session {
  id: string
  status: ApprovalStatus
  user_id: string
  org_id: string
  duration_sec: number
  notes?: string | null
}

interface AuditEntry {
  actor_id: string
  action: string
  resource_type: string
  resource_id: string
  metadata?: Record<string, unknown>
}

interface EmailNotification {
  to: string
  subject: string
  body: string
}

// Simulated approve logic
function approveSession(
  session: Session,
  actorId: string,
): { updatedSession: Session; auditEntry: AuditEntry } {
  if (session.status !== 'pending') {
    throw new Error(`Cannot approve a session with status: ${session.status}`)
  }

  const updatedSession: Session = { ...session, status: 'approved' }
  const auditEntry: AuditEntry = {
    actor_id: actorId,
    action: 'approve',
    resource_type: 'time_session',
    resource_id: session.id,
    metadata: { previous_status: 'pending' },
  }
  return { updatedSession, auditEntry }
}

// Simulated reject logic
function rejectSession(
  session: Session,
  actorId: string,
  reason: string,
): { updatedSession: Session; auditEntry: AuditEntry; notification: EmailNotification } {
  if (session.status !== 'pending') {
    throw new Error(`Cannot reject a session with status: ${session.status}`)
  }

  const updatedSession: Session = { ...session, status: 'rejected' }
  const auditEntry: AuditEntry = {
    actor_id: actorId,
    action: 'reject',
    resource_type: 'time_session',
    resource_id: session.id,
    metadata: { reason, previous_status: 'pending' },
  }
  const notification: EmailNotification = {
    to: `user-${session.user_id}@example.com`,
    subject: 'Your time entry was rejected',
    body: `Your session was rejected. Reason: ${reason}`,
  }
  return { updatedSession, auditEntry, notification }
}

// Simulated admin-edit logic
function adminEditSession(
  session: Session,
  actorId: string,
  changes: Partial<Pick<Session, 'duration_sec' | 'notes'>>,
): { updatedSession: Session; auditEntry: AuditEntry } {
  const updatedSession: Session = { ...session, ...changes }
  const auditEntry: AuditEntry = {
    actor_id: actorId,
    action: 'admin_edit',
    resource_type: 'time_session',
    resource_id: session.id,
    metadata: { changes, previous: { duration_sec: session.duration_sec, notes: session.notes } },
  }
  return { updatedSession, auditEntry }
}

const PENDING_SESSION: Session = {
  id: 'sess-001',
  status: 'pending',
  user_id: 'user-123',
  org_id: 'org-abc',
  duration_sec: 7200,
}

describe('approveSession', () => {
  it('transitions session status to approved', () => {
    const { updatedSession } = approveSession(PENDING_SESSION, 'manager-1')
    expect(updatedSession.status).toBe('approved')
  })

  it('creates an audit log entry with action "approve"', () => {
    const { auditEntry } = approveSession(PENDING_SESSION, 'manager-1')
    expect(auditEntry.action).toBe('approve')
    expect(auditEntry.resource_id).toBe('sess-001')
    expect(auditEntry.actor_id).toBe('manager-1')
    expect(auditEntry.metadata?.previous_status).toBe('pending')
  })

  it('throws when approving a non-pending session', () => {
    const approved: Session = { ...PENDING_SESSION, status: 'approved' }
    expect(() => approveSession(approved, 'manager-1')).toThrow('Cannot approve a session with status: approved')
  })

  it('throws when approving a rejected session', () => {
    const rejected: Session = { ...PENDING_SESSION, status: 'rejected' }
    expect(() => approveSession(rejected, 'manager-1')).toThrow()
  })
})

describe('rejectSession', () => {
  it('transitions session status to rejected', () => {
    const { updatedSession } = rejectSession(PENDING_SESSION, 'manager-1', 'Duplicate entry')
    expect(updatedSession.status).toBe('rejected')
  })

  it('creates an audit log entry with action "reject" and reason', () => {
    const { auditEntry } = rejectSession(PENDING_SESSION, 'manager-1', 'Overtime not authorized')
    expect(auditEntry.action).toBe('reject')
    expect(auditEntry.metadata?.reason).toBe('Overtime not authorized')
    expect(auditEntry.metadata?.previous_status).toBe('pending')
  })

  it('generates an email notification to the session owner', () => {
    const { notification } = rejectSession(PENDING_SESSION, 'manager-1', 'Too long')
    expect(notification.to).toContain('user-123')
    expect(notification.subject).toContain('rejected')
    expect(notification.body).toContain('Too long')
  })

  it('throws when rejecting a non-pending session', () => {
    const draft: Session = { ...PENDING_SESSION, status: 'draft' }
    expect(() => rejectSession(draft, 'manager-1', 'Not allowed')).toThrow()
  })
})

describe('adminEditSession', () => {
  it('applies duration change correctly', () => {
    const { updatedSession } = adminEditSession(PENDING_SESSION, 'admin-1', { duration_sec: 3600 })
    expect(updatedSession.duration_sec).toBe(3600)
    expect(updatedSession.status).toBe('pending') // status unchanged
  })

  it('records original values in audit metadata', () => {
    const { auditEntry } = adminEditSession(PENDING_SESSION, 'admin-1', { duration_sec: 3600 })
    expect(auditEntry.metadata?.previous).toMatchObject({ duration_sec: 7200 })
    expect(auditEntry.action).toBe('admin_edit')
  })

  it('applies notes change', () => {
    const { updatedSession } = adminEditSession(PENDING_SESSION, 'admin-1', { notes: 'Corrected overtime' })
    expect(updatedSession.notes).toBe('Corrected overtime')
  })
})

// ── Role-gating for approval routes ──────────────────────────────────────────

function canApprove(role: string): boolean {
  return ['admin', 'super_admin', 'manager'].includes(role)
}

describe('Approval role-gating', () => {
  it('allows manager to approve/reject', () => {
    expect(canApprove('manager')).toBe(true)
  })

  it('allows admin to approve/reject', () => {
    expect(canApprove('admin')).toBe(true)
  })

  it('blocks employee from approving', () => {
    expect(canApprove('employee')).toBe(false)
  })

  it('blocks unknown role from approving', () => {
    expect(canApprove('viewer')).toBe(false)
  })
})
