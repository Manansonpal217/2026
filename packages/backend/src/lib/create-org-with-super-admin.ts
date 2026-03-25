import type { Prisma } from '@prisma/client'

export const DISPOSABLE_SIGNUP_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwam.com',
  'yopmail.com',
]

export function isDisposableSignupEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return !!(domain && DISPOSABLE_SIGNUP_DOMAINS.includes(domain))
}

export async function createOrgWithSuperAdmin(
  tx: Prisma.TransactionClient,
  input: {
    org_name: string
    slug: string
    full_name: string
    email: string
    password_hash: string
    data_region?: string
  }
): Promise<{ orgId: string; userId: string }> {
  const emailLower = input.email.toLowerCase()
  if (isDisposableSignupEmail(emailLower)) {
    throw Object.assign(new Error('DISPOSABLE_EMAIL'), { code: 'DISPOSABLE_EMAIL' as const })
  }

  const org = await tx.organization.create({
    data: {
      name: input.org_name,
      slug: input.slug.toLowerCase(),
      data_region: input.data_region || 'us-east-1',
    },
  })
  await tx.orgSettings.create({
    data: { org_id: org.id },
  })
  const user = await tx.user.create({
    data: {
      org_id: org.id,
      email: emailLower,
      password_hash: input.password_hash,
      name: input.full_name,
      role: 'super_admin',
      status: 'active',
    },
  })
  return { orgId: org.id, userId: user.id }
}
