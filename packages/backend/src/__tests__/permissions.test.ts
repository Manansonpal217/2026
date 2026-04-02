import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
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
})

describe('hasPermission', () => {
  it('grants super_admin every capability', () => {
    const u = { id: 'a', org_id: ORG, role: 'super_admin' }
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.SETTINGS_MANAGE_SS_DURATION)).toBe(true)
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(true)
  })

  it('grants admin full org permission set', () => {
    const u = { id: 'a', org_id: ORG, role: 'admin' }
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_SUSPEND)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_MANAGER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_ADMIN)).toBe(true)
    expect(hasPermission(u, Permission.SETTINGS_MANAGE_BLUR_DELETE)).toBe(true)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_ORG)).toBe(true)
  })

  it('grants manager people-management access but not org-wide user assignment', () => {
    const u = { id: 'm', org_id: ORG, role: 'manager' }
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(true)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_USER)).toBe(true)
    expect(hasPermission(u, Permission.USERS_ASSIGN_MANAGER)).toBe(false)
    expect(hasPermission(u, Permission.USERS_SUSPEND)).toBe(false)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_MANAGER)).toBe(false)
    expect(hasPermission(u, Permission.USERS_ROLE_SET_ADMIN)).toBe(false)
  })

  it('denies employee elevated permissions', () => {
    const u = { id: 'e', org_id: ORG, role: 'employee' }
    expect(hasPermission(u, Permission.MANAGERS_ACCESS)).toBe(false)
    expect(hasPermission(u, Permission.OFFLINE_TIME_MANAGE_USER)).toBe(false)
  })
})

describe('isSuperAdminRole', () => {
  it('detects super_admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true)
    expect(isSuperAdminRole('admin')).toBe(false)
  })
})

describe('mayActAsPeopleManager', () => {
  it('includes management roles', () => {
    expect(mayActAsPeopleManager('super_admin')).toBe(true)
    expect(mayActAsPeopleManager('admin')).toBe(true)
    expect(mayActAsPeopleManager('manager')).toBe(true)
    expect(mayActAsPeopleManager('employee')).toBe(false)
  })
})

describe('userWhereVisibleToOrgPeers', () => {
  it('includes self or non–super_admin roles', () => {
    const p = { id: 'u1', org_id: ORG, role: 'admin' }
    expect(userWhereVisibleToOrgPeers(p)).toEqual({
      OR: [{ id: 'u1' }, { role: { not: 'super_admin' } }],
    })
  })
})

describe('canAccessOrgUser', () => {
  it('allows self without querying subject role', async () => {
    const principal = { id: 'me', org_id: ORG, role: 'admin' }
    await expect(canAccessOrgUser(principal, 'me')).resolves.toBe(true)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('denies admin access to another org super_admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'sa',
      role: 'super_admin',
      manager_id: null,
    })
    const principal = { id: 'adm', org_id: ORG, role: 'admin' }
    await expect(canAccessOrgUser(principal, 'sa')).resolves.toBe(false)
  })

  it('allows super_admin access to another org super_admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'sa2',
      role: 'super_admin',
      manager_id: null,
    })
    const principal = { id: 'sa1', org_id: ORG, role: 'super_admin' }
    await expect(canAccessOrgUser(principal, 'sa2')).resolves.toBe(true)
  })

  it('allows admin access to employee', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'emp',
      role: 'employee',
      manager_id: null,
    })
    const principal = { id: 'adm', org_id: ORG, role: 'admin' }
    await expect(canAccessOrgUser(principal, 'emp')).resolves.toBe(true)
  })

  it('denies manager access to super_admin direct report', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'sa',
      role: 'super_admin',
      manager_id: 'mgr',
    })
    const principal = { id: 'mgr', org_id: ORG, role: 'manager' }
    await expect(canAccessOrgUser(principal, 'sa')).resolves.toBe(false)
  })
})

describe('filterAccessibleUserIds', () => {
  it('drops super_admin ids for org admin principal', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'e1', role: 'employee' },
      { id: 'sa', role: 'super_admin' },
    ])
    const principal = { id: 'adm', org_id: ORG, role: 'admin' }
    await expect(filterAccessibleUserIds(principal, ['e1', 'sa'])).resolves.toEqual(['e1'])
  })

  it('keeps super_admin ids for super_admin principal', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'e1', role: 'employee' },
      { id: 'sa', role: 'super_admin' },
    ])
    const principal = { id: 'sa0', org_id: ORG, role: 'super_admin' }
    await expect(filterAccessibleUserIds(principal, ['e1', 'sa'])).resolves.toEqual(['e1', 'sa'])
  })
})
