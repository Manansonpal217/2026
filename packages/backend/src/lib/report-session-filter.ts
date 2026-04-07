import type { Prisma } from '@prisma/client'
import { timeApprovalTotalsFilter } from './time-approval-scope.js'

/**
 * Sessions counted in manager reports: completed sessions whose **start** falls in [from, to].
 * Matches {@link routes/reports/time.ts} — avoids requiring `ended_at <= to` (which dropped valid sessions).
 */
export async function reportSessionWhere(
  orgId: string,
  userIds: string[],
  fromDate: Date,
  toDate: Date,
  extra: Prisma.TimeSessionWhereInput = {}
): Promise<Prisma.TimeSessionWhereInput> {
  const approval = await timeApprovalTotalsFilter(orgId)
  return {
    org_id: orgId,
    user_id: { in: userIds },
    ended_at: { not: null },
    started_at: { gte: fromDate, lte: toDate },
    ...approval,
    ...extra,
  }
}
