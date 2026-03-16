import { describe, it, expect } from 'vitest'

// ── Organization settings validation logic tests ──────────────────────────────

interface ActivityWeights {
  keyboard: number
  mouse: number
  focus: number
}

interface OrgSettings {
  screenshot_interval_sec: number
  screenshot_retention_days: number
  blur_screenshots: boolean
  require_time_approval: boolean
  require_mfa: boolean
  activity_weights: ActivityWeights
  budget_alert_threshold: number
}

// Mirrors the validation logic from admin/settings.ts
function validateActivityWeights(w: ActivityWeights): string | null {
  const total = w.keyboard + w.mouse + w.focus
  const epsilon = 0.01
  if (Math.abs(total - 1.0) > epsilon) {
    return `activity_weights must sum to 1.0, got ${total}`
  }
  if (w.keyboard < 0 || w.mouse < 0 || w.focus < 0) {
    return 'all activity_weights must be non-negative'
  }
  return null
}

function validateSettings(s: Partial<OrgSettings>): string | null {
  if (s.screenshot_interval_sec !== undefined) {
    if (s.screenshot_interval_sec < 30 || s.screenshot_interval_sec > 3600) {
      return 'screenshot_interval_sec must be between 30 and 3600'
    }
  }
  if (s.screenshot_retention_days !== undefined) {
    if (s.screenshot_retention_days < 1 || s.screenshot_retention_days > 365) {
      return 'screenshot_retention_days must be between 1 and 365'
    }
  }
  if (s.budget_alert_threshold !== undefined) {
    if (s.budget_alert_threshold < 0 || s.budget_alert_threshold > 100) {
      return 'budget_alert_threshold must be between 0 and 100'
    }
  }
  if (s.activity_weights !== undefined) {
    return validateActivityWeights(s.activity_weights)
  }
  return null
}

describe('validateActivityWeights', () => {
  it('accepts weights that sum to exactly 1.0', () => {
    expect(validateActivityWeights({ keyboard: 0.4, mouse: 0.3, focus: 0.3 })).toBeNull()
  })

  it('accepts weights that sum to 1.0 with floating point tolerance', () => {
    // 0.1 + 0.2 + 0.7 = 0.9999999... due to float
    expect(validateActivityWeights({ keyboard: 0.1, mouse: 0.2, focus: 0.7 })).toBeNull()
  })

  it('rejects weights that sum to more than 1.0', () => {
    const err = validateActivityWeights({ keyboard: 0.5, mouse: 0.4, focus: 0.3 })
    expect(err).not.toBeNull()
    expect(err).toContain('sum to 1.0')
  })

  it('rejects weights that sum to less than 1.0', () => {
    const err = validateActivityWeights({ keyboard: 0.2, mouse: 0.2, focus: 0.2 })
    expect(err).toContain('sum to 1.0')
  })

  it('rejects negative weights', () => {
    const err = validateActivityWeights({ keyboard: -0.1, mouse: 0.6, focus: 0.5 })
    expect(err).toContain('non-negative')
  })

  it('accepts equal weights (1/3 each ≈ 0.333)', () => {
    const w = 1 / 3
    expect(validateActivityWeights({ keyboard: w, mouse: w, focus: w })).toBeNull()
  })
})

describe('validateSettings', () => {
  it('accepts valid screenshot interval', () => {
    expect(validateSettings({ screenshot_interval_sec: 300 })).toBeNull()
  })

  it('rejects screenshot interval below minimum', () => {
    const err = validateSettings({ screenshot_interval_sec: 10 })
    expect(err).toContain('30')
  })

  it('rejects screenshot interval above maximum', () => {
    const err = validateSettings({ screenshot_interval_sec: 7200 })
    expect(err).toContain('3600')
  })

  it('accepts boundary values for screenshot interval', () => {
    expect(validateSettings({ screenshot_interval_sec: 30 })).toBeNull()
    expect(validateSettings({ screenshot_interval_sec: 3600 })).toBeNull()
  })

  it('accepts valid retention days', () => {
    expect(validateSettings({ screenshot_retention_days: 90 })).toBeNull()
  })

  it('rejects retention days of 0', () => {
    const err = validateSettings({ screenshot_retention_days: 0 })
    expect(err).toContain('1')
  })

  it('rejects retention days over 365', () => {
    const err = validateSettings({ screenshot_retention_days: 400 })
    expect(err).toContain('365')
  })

  it('validates activity_weights when present', () => {
    const err = validateSettings({ activity_weights: { keyboard: 0.5, mouse: 0.5, focus: 0.5 } })
    expect(err).toContain('sum to 1.0')
  })
})

// ── Budget alert threshold logic ──────────────────────────────────────────────

interface ProjectBudget {
  project_id: string
  budget_hours: number
  tracked_hours: number
  alert_threshold_pct: number
}

function shouldTriggerBudgetAlert(budget: ProjectBudget): boolean {
  if (budget.budget_hours <= 0) return false
  const usagePct = (budget.tracked_hours / budget.budget_hours) * 100
  return usagePct >= budget.alert_threshold_pct
}

function getBudgetUsagePercent(budget: ProjectBudget): number {
  if (budget.budget_hours <= 0) return 0
  return (budget.tracked_hours / budget.budget_hours) * 100
}

describe('Budget alert threshold', () => {
  it('triggers alert when usage exceeds threshold', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 100,
      tracked_hours: 80,
      alert_threshold_pct: 75,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(true)
  })

  it('triggers alert at exactly the threshold', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 100,
      tracked_hours: 75,
      alert_threshold_pct: 75,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(true)
  })

  it('does not trigger alert below threshold', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 100,
      tracked_hours: 50,
      alert_threshold_pct: 75,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(false)
  })

  it('does not trigger alert when budget_hours is 0', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 0,
      tracked_hours: 10,
      alert_threshold_pct: 75,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(false)
  })

  it('calculates correct usage percentage', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 200,
      tracked_hours: 150,
      alert_threshold_pct: 80,
    }
    expect(getBudgetUsagePercent(budget)).toBe(75)
  })

  it('handles 100% usage', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 50,
      tracked_hours: 50,
      alert_threshold_pct: 90,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(true)
    expect(getBudgetUsagePercent(budget)).toBe(100)
  })

  it('handles over-budget (>100% usage)', () => {
    const budget: ProjectBudget = {
      project_id: 'proj-1',
      budget_hours: 50,
      tracked_hours: 60,
      alert_threshold_pct: 100,
    }
    expect(shouldTriggerBudgetAlert(budget)).toBe(true)
    expect(getBudgetUsagePercent(budget)).toBe(120)
  })
})

// ── Audit log structure tests ─────────────────────────────────────────────────

interface AuditLogEntry {
  id: string
  actor_id: string
  actor_role: string
  action: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown>
  created_at: Date
  org_id: string
}

function createAuditEntry(
  actorId: string,
  actorRole: string,
  action: string,
  resourceType: string,
  resourceId: string,
  orgId: string,
  metadata: Record<string, unknown> = {},
): Omit<AuditLogEntry, 'id' | 'created_at'> {
  return { actor_id: actorId, actor_role: actorRole, action, resource_type: resourceType, resource_id: resourceId, org_id: orgId, metadata }
}

describe('Audit log entry creation', () => {
  it('creates entry with all required fields', () => {
    const entry = createAuditEntry('admin-1', 'admin', 'update_settings', 'org_settings', 'org-abc', 'org-abc', { changed: 'blur_screenshots' })
    expect(entry.actor_id).toBe('admin-1')
    expect(entry.action).toBe('update_settings')
    expect(entry.resource_type).toBe('org_settings')
    expect(entry.org_id).toBe('org-abc')
    expect(entry.metadata).toMatchObject({ changed: 'blur_screenshots' })
  })

  it('defaults metadata to empty object when not provided', () => {
    const entry = createAuditEntry('admin-1', 'admin', 'view', 'report', 'report-1', 'org-abc')
    expect(entry.metadata).toEqual({})
  })

  it('captures actor role in entry', () => {
    const entry = createAuditEntry('super-1', 'super_admin', 'delete_user', 'user', 'user-999', 'org-abc')
    expect(entry.actor_role).toBe('super_admin')
  })
})
