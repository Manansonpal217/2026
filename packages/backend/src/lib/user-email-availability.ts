import type { Prisma, PrismaClient } from '@prisma/client'

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase()
}

type Db = PrismaClient | Prisma.TransactionClient

export async function findRegisteredUserByEmail(
  db: Db,
  email: string
): Promise<{ id: string; org_id: string | null; is_platform_admin: boolean } | null> {
  const normalized = normalizeUserEmail(email)
  return db.user.findFirst({
    where: { email: normalized },
    select: { id: true, org_id: true, is_platform_admin: true },
  })
}

/** Pending invite: not accepted and not yet expired. */
export async function findConflictingActiveInvite(
  db: Db,
  email: string,
  opts?: { excludeOrgId?: string }
): Promise<{ id: string; org_id: string } | null> {
  const normalized = normalizeUserEmail(email)
  const now = new Date()
  return db.invite.findFirst({
    where: {
      email: normalized,
      accepted_at: null,
      expires_at: { gt: now },
      ...(opts?.excludeOrgId ? { org_id: { not: opts.excludeOrgId } } : {}),
    },
    select: { id: true, org_id: true },
  })
}

/** True if this email can be used for a brand-new user (signup, invite, platform create). */
export function isPrismaUniqueOnUserEmail(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: string[] } }
  if (e.code !== 'P2002' || !Array.isArray(e.meta?.target)) return false
  return e.meta.target.includes('email')
}

export async function isEmailAvailableForNewUser(
  db: Db,
  email: string,
  opts?: { excludeOrgIdForInvite?: string }
): Promise<{ ok: true } | { ok: false; reason: 'USER' | 'INVITE_OTHER_ORG' }> {
  const existing = await findRegisteredUserByEmail(db, email)
  if (existing) {
    return { ok: false, reason: 'USER' }
  }
  const invite = await findConflictingActiveInvite(db, email, {
    excludeOrgId: opts?.excludeOrgIdForInvite,
  })
  if (invite) {
    return { ok: false, reason: 'INVITE_OTHER_ORG' }
  }
  return { ok: true }
}
