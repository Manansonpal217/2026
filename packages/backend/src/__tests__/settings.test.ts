import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueOverride = vi.fn()
const mockFindUniqueOrg = vi.fn()
const mockFindFirstIntegration = vi.fn()

const mockDb = {
  userSettingsOverride: {
    findUnique: (...args: unknown[]) => mockFindUniqueOverride(...args),
  },
  orgSettings: {
    findUnique: (...args: unknown[]) => mockFindUniqueOrg(...args),
  },
  integration: {
    findFirst: (...args: unknown[]) => mockFindFirstIntegration(...args),
  },
}

import {
  OVERRIDABLE_KEYS,
  resolveFeature,
  isOverridableKey,
  type OverridableKey,
} from '../lib/settings.js'

const ORG = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  mockFindUniqueOverride.mockReset()
  mockFindUniqueOrg.mockReset()
  mockFindFirstIntegration.mockReset()
})

describe('isOverridableKey', () => {
  it('returns true for allowlisted keys', () => {
    expect(isOverridableKey('ss_capture_enabled')).toBe(true)
    expect(isOverridableKey('jira_connected')).toBe(true)
  })

  it('returns false for unknown keys', () => {
    expect(isOverridableKey('evil_key')).toBe(false)
    expect(isOverridableKey('')).toBe(false)
  })
})

describe('resolveFeature', () => {
  it('tier 1: returns UserSettingsOverride value when present', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce({ value: 'false' })
    const v = await resolveFeature(ORG, USER, 'ss_capture_enabled', mockDb as never)
    expect(v).toBe('false')
    expect(mockFindUniqueOverride).toHaveBeenCalledWith({
      where: {
        org_id_user_id_feature_key: {
          org_id: ORG,
          user_id: USER,
          feature_key: 'ss_capture_enabled',
        },
      },
    })
    expect(mockFindUniqueOrg).not.toHaveBeenCalled()
  })

  it('tier 2: maps ss_capture_interval_seconds from OrgSettings', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindUniqueOrg.mockResolvedValueOnce({ screenshot_interval_seconds: 120 })
    const v = await resolveFeature(ORG, USER, 'ss_capture_interval_seconds', mockDb as never)
    expect(v).toBe('120')
  })

  it('tier 2: maps expected_daily_work_minutes from OrgSettings', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindUniqueOrg.mockResolvedValueOnce({ expected_daily_work_minutes: 360 })
    const v = await resolveFeature(ORG, USER, 'expected_daily_work_minutes', mockDb as never)
    expect(v).toBe('360')
  })

  it('tier 2: jira_connected reflects active jira integration', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindFirstIntegration.mockResolvedValueOnce({ id: 'int-1' })
    const v = await resolveFeature(ORG, USER, 'jira_connected', mockDb as never)
    expect(v).toBe('true')
    expect(mockFindUniqueOrg).not.toHaveBeenCalled()
  })

  it('tier 2: jira_connected false when no integration', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindFirstIntegration.mockResolvedValueOnce(null)
    const v = await resolveFeature(ORG, USER, 'jira_connected', mockDb as never)
    expect(v).toBe('false')
  })

  it('tier 3: uses OVERRIDABLE_KEYS when no override and no org row', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindUniqueOrg.mockResolvedValueOnce(null)
    const v = await resolveFeature(ORG, USER, 'ss_capture_interval_seconds', mockDb as never)
    expect(v).toBe(String(OVERRIDABLE_KEYS.ss_capture_interval_seconds))
  })

  it('tier 3: boolean keys fall back to system default', async () => {
    mockFindUniqueOverride.mockResolvedValueOnce(null)
    mockFindUniqueOrg.mockResolvedValueOnce({ screenshot_interval_seconds: 60 })
    const v = await resolveFeature(ORG, USER, 'ss_click_notification_enabled', mockDb as never)
    expect(v).toBe(String(OVERRIDABLE_KEYS.ss_click_notification_enabled))
  })

  it('satisfies OverridableKey union for known keys', () => {
    const k: OverridableKey = 'ss_blur_allowed'
    expect(k).toBeDefined()
  })
})
