import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply } from 'fastify'
import {
  idleScoreThresholdFromMinutes,
  parseIds,
  reportMeta,
  resolveUserIds,
} from '../lib/report-helpers.js'
import type { AuthenticatedRequest } from '../middleware/authenticate.js'

const mockTeamFindFirst = vi.fn()
const mockTeamMemberFindMany = vi.fn()
const mockUserFindMany = vi.fn()

vi.mock('../db/prisma.js', () => ({
  prisma: {
    team: { findFirst: (...a: unknown[]) => mockTeamFindFirst(...a) },
    teamMember: { findMany: (...a: unknown[]) => mockTeamMemberFindMany(...a) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
  },
}))

describe('productivity report helpers', () => {
  it('idleScoreThresholdFromMinutes maps sensitivity to score cutoff', () => {
    expect(idleScoreThresholdFromMinutes(5)).toBe(85)
    expect(idleScoreThresholdFromMinutes(30)).toBe(10)
    expect(idleScoreThresholdFromMinutes(1)).toBe(97)
  })

  it('parseIds wraps a single query string as one element (comma lists split by caller)', () => {
    expect(parseIds('a,b')).toEqual(['a,b'])
  })

  it('reportMeta includes ISO from/to and optional total', () => {
    const m = reportMeta(
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2025-01-31T23:59:59.999Z'),
      3
    )
    expect(m).toMatchObject({
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-01-31T23:59:59.999Z',
      total: 3,
    })
  })
})

describe('resolveUserIds with teamId', () => {
  const ORG = 'org-1'
  const adminReq = {
    user: { id: 'admin-1', org_id: ORG, role: 'ADMIN' },
  } as AuthenticatedRequest

  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply

  beforeEach(() => {
    mockTeamFindFirst.mockReset()
    mockTeamMemberFindMany.mockReset()
    mockUserFindMany.mockReset()
  })

  it('intersects org-wide user list with team members', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])
    mockTeamFindFirst.mockResolvedValueOnce({ id: 'team-1' })
    mockTeamMemberFindMany.mockResolvedValueOnce([{ user_id: 'u2' }, { user_id: 'u4' }])

    const ids = await resolveUserIds(adminReq, reply, undefined, { teamId: 'team-1' })
    expect(ids).toEqual(['u2'])
    expect(mockTeamFindFirst).toHaveBeenCalledWith({
      where: { id: 'team-1', org_id: ORG },
      select: { id: true },
    })
  })

  it('returns 404 when team is not in org', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u1' }])
    mockTeamFindFirst.mockResolvedValueOnce(null)

    const ids = await resolveUserIds(adminReq, reply, undefined, { teamId: 'missing' })
    expect(ids).toBeNull()
    expect(reply.status).toHaveBeenCalledWith(404)
  })
})
