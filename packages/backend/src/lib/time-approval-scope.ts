import { prisma } from '../db/prisma.js'

/**
 * When org requires time approval, reported totals should only include approved sessions.
 * List/detail UIs may still show pending rows for workflow.
 */
export async function timeApprovalTotalsFilter(
  orgId: string
): Promise<{ approval_status: 'APPROVED' } | Record<string, never>> {
  const s = await prisma.orgSettings.findUnique({
    where: { org_id: orgId },
    select: { time_approval_required: true },
  })
  return s?.time_approval_required ? { approval_status: 'APPROVED' as const } : {}
}
