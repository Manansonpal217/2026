import { describe, it, expect, vi } from 'vitest'
import {
  normalizeUserEmail,
  isPrismaUniqueOnUserEmail,
  isEmailAvailableForNewUser,
  findConflictingActiveInvite,
} from '../lib/user-email-availability.js'

describe('normalizeUserEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeUserEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })
})

describe('isPrismaUniqueOnUserEmail', () => {
  it('returns true when Prisma unique target includes email', () => {
    expect(isPrismaUniqueOnUserEmail({ code: 'P2002', meta: { target: ['email'] } })).toBe(true)
  })
  it('returns false for slug unique', () => {
    expect(isPrismaUniqueOnUserEmail({ code: 'P2002', meta: { target: ['slug'] } })).toBe(false)
  })
  it('returns false when not P2002', () => {
    expect(isPrismaUniqueOnUserEmail({ code: 'P2003', meta: { target: ['email'] } })).toBe(false)
  })
})

describe('isEmailAvailableForNewUser', () => {
  it('fails when a user row exists for the email', async () => {
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'u1', org_id: 'o1', is_platform_admin: false }),
      },
      invite: { findFirst: vi.fn() },
    }
    const r = await isEmailAvailableForNewUser(db as never, 'a@b.com')
    expect(r).toEqual({ ok: false, reason: 'USER' })
    expect(db.invite.findFirst).not.toHaveBeenCalled()
  })

  it('fails when another org has an active invite', async () => {
    const db = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      invite: {
        findFirst: vi.fn().mockResolvedValue({ id: 'inv1', org_id: 'other-org' }),
      },
    }
    const r = await isEmailAvailableForNewUser(db as never, 'a@b.com', {
      excludeOrgIdForInvite: 'this-org',
    })
    expect(r).toEqual({ ok: false, reason: 'INVITE_OTHER_ORG' })
    expect(db.invite.findFirst).toHaveBeenCalled()
  })

  it('allows when active invite exists only in excluded org', async () => {
    const db = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      invite: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    const r = await isEmailAvailableForNewUser(db as never, 'a@b.com', {
      excludeOrgIdForInvite: 'this-org',
    })
    expect(r).toEqual({ ok: true })
  })
})

describe('findConflictingActiveInvite', () => {
  it('passes excludeOrgId to prisma', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const db = { invite: { findFirst } }
    await findConflictingActiveInvite(db as never, 'X@Y.Z', { excludeOrgId: 'org-1' })
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'x@y.z',
          org_id: { not: 'org-1' },
        }),
      })
    )
  })
})
