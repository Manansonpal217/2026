/**
 * Timezone-aware BullMQ repeatable job registration for org report emails.
 * BullMQ cron runs in server UTC, so every cron expression is converted from
 * "local org time" to UTC at registration time. Re-register whenever org timezone changes.
 */
import { getReportEmailQueue } from '../queues/index.js'

/**
 * Return the UTC offset in whole minutes for the given IANA timezone at the current instant.
 * Positive = east of UTC (e.g., UTC+5:30 → 330).
 */
function getUtcOffsetMinutes(timezone: string): number {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  return Math.round((new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000)
}

/**
 * Convert a local weekday + time to a UTC cron expression.
 * @param localHour  0-23 in org timezone
 * @param localMin   0-59
 * @param dow        0=Sun, 1=Mon … 6=Sat in org timezone
 */
function toUtcWeeklyCron(
  localHour: number,
  localMin: number,
  dow: number,
  timezone: string
): string {
  const offsetMin = getUtcOffsetMinutes(timezone)
  let totalMin = localHour * 60 + localMin - offsetMin
  let adjustedDow = dow

  while (totalMin < 0) {
    totalMin += 24 * 60
    adjustedDow = (adjustedDow - 1 + 7) % 7
  }
  while (totalMin >= 24 * 60) {
    totalMin -= 24 * 60
    adjustedDow = (adjustedDow + 1) % 7
  }

  const utcHour = Math.floor(totalMin / 60)
  const utcMin = totalMin % 60
  return `${utcMin} ${utcHour} * * ${adjustedDow}`
}

/**
 * Convert a local day-of-month + time to a UTC cron expression.
 * Day-of-month rollover is clamped to 1–28 to avoid month-end edge cases;
 * accept ±1 day drift for org timezones where offset crosses midnight.
 */
function toUtcMonthlyCron(
  localHour: number,
  localMin: number,
  dayOfMonth: number,
  timezone: string
): string {
  const offsetMin = getUtcOffsetMinutes(timezone)
  let totalMin = localHour * 60 + localMin - offsetMin
  let domAdj = 0

  if (totalMin < 0) {
    totalMin += 24 * 60
    domAdj = -1
  } else if (totalMin >= 24 * 60) {
    totalMin -= 24 * 60
    domAdj = 1
  }

  const utcHour = Math.floor(totalMin / 60)
  const utcMin = totalMin % 60
  const utcDay = Math.max(1, Math.min(28, dayOfMonth + domAdj))
  return `${utcMin} ${utcHour} ${utcDay} * *`
}

const ORG_JOB_PREFIXES = ['weekly-user', 'weekly-manager', 'monthly-manager', 'monthly-admin']

/**
 * Register (or re-register after TZ change) all 4 repeatable report jobs for an org.
 * Removes stale repeatable jobs first so old UTC cron patterns do not persist.
 * Idempotent when called with the same timezone.
 */
export async function registerOrgReportJobs(orgId: string, timezone: string): Promise<void> {
  const queue = getReportEmailQueue()
  const tz = timezone || 'UTC'

  // Remove any existing repeatable jobs belonging to this org
  const existing = await queue.getRepeatableJobs()
  for (const job of existing) {
    if (ORG_JOB_PREFIXES.some((prefix) => job.id === `${prefix}-${orgId}`)) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  // Monday 08:00 org-TZ → UTC weekly cron (dow=1)
  const weeklyCron = toUtcWeeklyCron(8, 0, 1, tz)
  // 1st of month 08:00 org-TZ → UTC monthly cron
  const monthlyCron = toUtcMonthlyCron(8, 0, 1, tz)

  await queue.add(
    'weekly-user-report',
    { orgId },
    { repeat: { pattern: weeklyCron }, jobId: `weekly-user-${orgId}` }
  )
  await queue.add(
    'weekly-manager-report',
    { orgId },
    { repeat: { pattern: weeklyCron }, jobId: `weekly-manager-${orgId}` }
  )
  await queue.add(
    'monthly-manager-report',
    { orgId },
    { repeat: { pattern: monthlyCron }, jobId: `monthly-manager-${orgId}` }
  )
  await queue.add(
    'monthly-admin-report',
    { orgId },
    { repeat: { pattern: monthlyCron }, jobId: `monthly-admin-${orgId}` }
  )
}
