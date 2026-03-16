import { describe, it, expect } from 'vitest'

// ── Report grouping logic tests ────────────────────────────────────────────────

interface Session {
  id: string
  user_id: string
  project_id: string | null
  started_at: Date
  duration_sec: number
  project?: { name: string } | null
  user?: { name: string } | null
}

function groupByDay(sessions: Session[]): Array<{ label: string; seconds: number; sessions: number }> {
  const dayMap = new Map<string, { seconds: number; sessions: number }>()
  for (const s of sessions) {
    const day = s.started_at.toISOString().split('T')[0]
    const existing = dayMap.get(day) ?? { seconds: 0, sessions: 0 }
    existing.seconds += s.duration_sec
    existing.sessions += 1
    dayMap.set(day, existing)
  }
  return [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, ...v }))
}

function groupByProject(sessions: Session[]): Array<{ label: string; seconds: number; sessions: number }> {
  const projMap = new Map<string, { name: string; seconds: number; sessions: number }>()
  for (const s of sessions) {
    const key = s.project_id ?? 'no-project'
    const name = s.project?.name ?? 'No project'
    const existing = projMap.get(key) ?? { name, seconds: 0, sessions: 0 }
    existing.seconds += s.duration_sec
    existing.sessions += 1
    projMap.set(key, existing)
  }
  return [...projMap.values()].sort((a, b) => b.seconds - a.seconds).map(({ name, seconds, sessions }) => ({ label: name, seconds, sessions }))
}

function groupByUser(sessions: Session[]): Array<{ label: string; seconds: number; sessions: number }> {
  const userMap = new Map<string, { name: string; seconds: number; sessions: number }>()
  for (const s of sessions) {
    const existing = userMap.get(s.user_id) ?? { name: s.user?.name ?? 'Unknown', seconds: 0, sessions: 0 }
    existing.seconds += s.duration_sec
    existing.sessions += 1
    userMap.set(s.user_id, existing)
  }
  return [...userMap.values()].sort((a, b) => b.seconds - a.seconds).map(({ name, seconds, sessions }) => ({ label: name, seconds, sessions }))
}

const SESSIONS: Session[] = [
  { id: '1', user_id: 'u1', project_id: 'p1', started_at: new Date('2024-01-15T10:00:00Z'), duration_sec: 3600, project: { name: 'Alpha' }, user: { name: 'Alice' } },
  { id: '2', user_id: 'u1', project_id: 'p1', started_at: new Date('2024-01-15T14:00:00Z'), duration_sec: 1800, project: { name: 'Alpha' }, user: { name: 'Alice' } },
  { id: '3', user_id: 'u2', project_id: 'p2', started_at: new Date('2024-01-16T09:00:00Z'), duration_sec: 7200, project: { name: 'Beta' }, user: { name: 'Bob' } },
  { id: '4', user_id: 'u1', project_id: null, started_at: new Date('2024-01-16T11:00:00Z'), duration_sec: 600, project: null, user: { name: 'Alice' } },
]

describe('groupByDay', () => {
  it('aggregates sessions by calendar day', () => {
    const result = groupByDay(SESSIONS)
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('2024-01-15')
    expect(result[0].seconds).toBe(3600 + 1800)
    expect(result[0].sessions).toBe(2)
    expect(result[1].label).toBe('2024-01-16')
    expect(result[1].seconds).toBe(7200 + 600)
  })

  it('returns sorted by date ascending', () => {
    const labels = groupByDay(SESSIONS).map((r) => r.label)
    expect(labels).toEqual([...labels].sort())
  })

  it('handles empty sessions', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('groupByProject', () => {
  it('aggregates by project and sorts by total time descending', () => {
    const result = groupByProject(SESSIONS)
    expect(result[0].label).toBe('Beta') // 7200s
    expect(result[0].seconds).toBe(7200)
    expect(result[1].label).toBe('Alpha') // 5400s
    expect(result[1].sessions).toBe(2)
  })

  it('groups no-project sessions together', () => {
    const result = groupByProject(SESSIONS)
    const noProject = result.find((r) => r.label === 'No project')
    expect(noProject).toBeDefined()
    expect(noProject?.seconds).toBe(600)
  })
})

describe('groupByUser', () => {
  it('aggregates by user correctly', () => {
    const result = groupByUser(SESSIONS)
    const alice = result.find((r) => r.label === 'Alice')
    const bob = result.find((r) => r.label === 'Bob')
    expect(alice).toBeDefined()
    expect(alice?.seconds).toBe(3600 + 1800 + 600)
    expect(alice?.sessions).toBe(3)
    expect(bob?.seconds).toBe(7200)
  })
})

// ── Role-gating logic ─────────────────────────────────────────────────────────

describe('Role-gating for reports', () => {
  function canViewOthersData(role: string): boolean {
    return ['admin', 'super_admin', 'manager'].includes(role)
  }

  it('allows admin to view other users data', () => {
    expect(canViewOthersData('admin')).toBe(true)
    expect(canViewOthersData('super_admin')).toBe(true)
    expect(canViewOthersData('manager')).toBe(true)
  })

  it('restricts employee to own data only', () => {
    expect(canViewOthersData('employee')).toBe(false)
  })
})

// ── CSV export logic ──────────────────────────────────────────────────────────

function formatCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(',')
}

describe('CSV export formatting', () => {
  it('produces correct header row', () => {
    const headers = ['Session ID', 'User Name', 'Duration (sec)']
    const row = formatCsvRow(headers)
    expect(row).toBe('Session ID,User Name,Duration (sec)')
  })

  it('quotes values containing commas', () => {
    const row = formatCsvRow(['abc,def', 'normal'])
    expect(row).toBe('"abc,def",normal')
  })

  it('escapes double quotes in values', () => {
    const row = formatCsvRow(['say "hello"'])
    expect(row).toBe('"say ""hello"""')
  })

  it('handles null and undefined as empty string', () => {
    const row = formatCsvRow([null, undefined, 'value'])
    expect(row).toBe(',,value')
  })

  it('converts numbers to strings', () => {
    const row = formatCsvRow([3600, 0])
    expect(row).toBe('3600,0')
  })
})
