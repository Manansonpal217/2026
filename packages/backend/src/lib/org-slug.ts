import type { PrismaClient } from '@prisma/client'

type OrgDb = Pick<PrismaClient, 'organization'>

function baseFromOrgName(orgName: string): string {
  const raw = orgName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  return raw.length >= 2 ? raw : 'org'
}

/**
 * Reserves a unique `Organization.slug` derived from the org display name.
 * Appends `-2`, `-3`, … when the base slug is taken (max length 40, `^[a-z0-9-]+$`).
 */
export async function allocateUniqueOrgSlug(db: OrgDb, orgName: string): Promise<string> {
  const normalized = baseFromOrgName(orgName)

  for (let i = 0; i < 10_000; i++) {
    const suffix = i === 0 ? '' : `-${i + 1}`
    const maxBase = 40 - suffix.length
    let base = normalized.slice(0, Math.max(2, maxBase)).replace(/-+$/g, '')
    if (base.length < 2) base = 'org'
    const slug = `${base}${suffix}`.slice(0, 40).toLowerCase()
    const taken = await db.organization.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!taken) return slug
  }

  throw Object.assign(new Error('Could not allocate a unique organization slug'), {
    code: 'SLUG_ALLOCATION_FAILED' as const,
  })
}

export function isPrismaUniqueOnOrganizationSlug(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: string[] } }
  if (e.code !== 'P2002' || !Array.isArray(e.meta?.target)) return false
  return e.meta.target.includes('slug')
}
