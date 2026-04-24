import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockTeamMemberFindFirst = vi.fn()
const mockTeamMemberFindMany = vi.fn()

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    teamMember: {
      findFirst: (...args: unknown[]) => mockTeamMemberFindFirst(...args),
      findMany: (...args: unknown[]) => mockTeamMemberFindMany(...args),
    },
  },
}))

import {
  Permission,
  hasPermission,
  isSuperAdminRole,
  mayActAsPeopleManager,
  canAccessOrgUser,
  filterAccessibleUserIds,
  userWhereVisibleToOrgPeers,
} from '../lib/permissions.js'

const ORG = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  mockFindFirst.mockReset()
  mockFindMany.mockReset()
  mockTeamMemberFindFirst.mockReset()
  mockTeamMemberFindMany.mockReset()
  mockTeamMemberFindFirst.mockResolvedValue(null)
  mockTeamMemberFindMany.mockResolvedValue([])
})

describe('hasPermission', () => {
  it('grants OWNER every capability', () => {
    const u = { id: 'a', org_id: ORG, role: 'OWNER' }
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.SETTINGS_MANAGE_SS_DURATION)).toBe(true)
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(true)
  })

  it('grants ADMIN full org permission set', () => {
    const u = { id: 'a', org_id: ORG, role: 'ADMIN' }
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_SUSPEND)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_ADMIN)).toBe(true)
    expect(hasPermission(u, Permission.SETTINGS_MANAGE_BLUR_DELETE)).toBe(true)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_ORG)).toBe(true)
  })

  it('grants MANAGER people-management access but not org-wide user assignment', () => {
    const u = { id: 'm', org_id: ORG, role: 'MANAGER' }
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(true)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_USER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(false)
    expect(hasPermission(u, Permission.USERS_SUSPEND)).toBe(false)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_MANAGER)).toBe(false)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_ADMIN)).toBe(false)
  })

  it('denies EMPLOYEE elevated permissions', () => {
    const u = { id: 'e', org_id: ORG, role: 'EMPLOYEE' }
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(false)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_USER)).toBe(false)
  })
})

describe('isSuperAdminRole', () => {
  it('aliases OWNER (deprecated name)', () => {
    expect(isSuperAdminRole('OWNER')).toBe(true)
    expect(isSuperAdminRole('ADMIN')).toBe(false)
  })
})

describe('mayActAsPeopleManager', () => {
  it('includes management roles', () => {
    expect(mayActAsPeopleManager('OWNER')).toBe(true)
    expect(mayActAsPeopleManager('ADMIN')).toBe(true)
    expect(mayActAsPeopleManager('MANAGER')).toBe(true)
    expect(mayActAsPeopleManager('EMPLOYEE')).toBe(false)
  })
})

describe('userWhereVisibleToOrgPeers', () => {
  it('includes self or non-OWNER roles', () => {
    const p = { id: 'u1', org_id: ORG, role: 'ADMIN' }
    expect(userWhereVisibleToOrgPeers(p)).toEqual({
      OR: [{ id: 'u1' }, { role: { not: 'OWNER' } }],
    })
  })
})

describe('canAccessOrgUser', () => {
  it('allows self without querying subject role', async () => {
    const principal = { id: 'me', org_id: ORG, role: 'ADMIN' }
    await expect(canAccessOrgUser(principal, 'me')).resolves.toBe(true)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('denies ADMIN access to another org OWNER', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'sa',
      role: 'OWNER',
      manager_id: null,
    })
    const principal = { id: 'adm', org_id: ORG, role: 'ADMIN' }
    await expect(canAccessOrgUser(principal, 'sa')).resolves.toBe(false)
  })

  it('allows OWNER access to another org OWNER', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'sa2',
      role: 'OWNER',
      manager_id: null,
    })
    const principal = { id: 'sa1', org_id: ORG, role: 'OWNER' }
    await expect(canAccessOrgUser(principal, 'sa2')).resolves.toBe(true)
  })

  it('allows ADMIN access to EMPLOYEE', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'emp',
      role: 'EMPLOYEE',
      manager_id: null,
    })
    const principal = { id: 'adm', org_id: ORG, role: 'ADMIN' }
    await expect(canAccessOrgUser(principal, 'emp')).resolves.toBe(true)
  })

  it('denies manager access to org owner', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'own',
      role: 'OWNER',
      manager_id: null,
    })
    const principal = { id: 'mgr', org_id: ORG, role: 'MANAGER' }
    await expect(canAccessOrgUser(principal, 'own')).resolves.toBe(false)
    expect(mockTeamMemberFindFirst).not.toHaveBeenCalled()
  })

  it('allows manager access to direct report', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'rep',
      role: 'EMPLOYEE',
      manager_id: 'mgr',
    })
    const principal = { id: 'mgr', org_id: ORG, role: 'MANAGER' }
    await expect(canAccessOrgUser(principal, 'rep')).resolves.toBe(true)
    expect(mockTeamMemberFindFirst).not.toHaveBeenCalled()
  })

  it('allows manager access to team member without line manager link', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'mem',
      role: 'EMPLOYEE',
      manager_id: null,
    })
    mockTeamMemberFindFirst.mockResolvedValue({ id: 'tm1' })
    const principal = { id: 'mgr', org_id: ORG, role: 'MANAGER' }
    await expect(canAccessOrgUser(principal, 'mem')).resolves.toBe(true)
  })
})

describe('filterAccessibleUserIds', () => {
  it('drops OWNER ids for ADMIN principal', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'e1', role: 'EMPLOYEE' },
      { id: 'sa', role: 'OWNER' },
    ])
    const principal = { id: 'adm', org_id: ORG, role: 'ADMIN' }
    await expect(filterAccessibleUserIds(principal, ['e1', 'sa'])).resolves.toEqual(['e1'])
  })

  it('keeps OWNER ids for OWNER principal', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'e1', role: 'EMPLOYEE' },
      { id: 'sa', role: 'OWNER' },
    ])
    const principal = { id: 'sa0', org_id: ORG, role: 'OWNER' }
    await expect(filterAccessibleUserIds(principal, ['e1', 'sa'])).resolves.toEqual(['e1', 'sa'])
  })
})
