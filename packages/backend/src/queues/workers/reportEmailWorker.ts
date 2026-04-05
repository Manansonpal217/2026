/**
 * BullMQ worker for the `report-emails` queue.
 * Handles: weekly-user-report, weekly-manager-report, monthly-manager-report,
 *          monthly-admin-report, payment-due-notice
 */
import { Worker, type Job } from 'bullmq'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'
import { sendEmail } from '../../services/email/emailService.js'
import { weeklyUserReportHtml } from '../../services/email/templates/weeklyUserReport.js'
import { weeklyManagerReportHtml } from '../../services/email/templates/weeklyManagerReport.js'
import { monthlyAdminReportHtml } from '../../services/email/templates/monthlyAdminReport.js'
import { paymentDueNoticeHtml } from '../../services/email/templates/paymentDueNotice.js'

// ─── Utilities ─────────────────────────────────────────────────────────────

function _fmtHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '0h 0m'
  if (h === 0) return `0h ${m}m`
  if (m === 0) return `${h}h 0m`
  return `${h}h ${m}m`
}

/** UTC offset in whole minutes for a timezone at the current instant. Positive = east. */
function getUtcOffsetMinutes(timezone: string): number {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  return Math.round((new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000)
}

/** Today's date string (YYYY-MM-DD) in the given timezone. */
function todayInTz(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

/** Build UTC start/end for a local calendar date in a timezone. */
function localDayToUtc(dateStr: string, timezone: string): { start: Date; end: Date } {
  const offsetMin = getUtcOffsetMinutes(timezone)
  const [y, m, d] = dateStr.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000),
    end: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMin * 60000),
  }
}

/** Offset a YYYY-MM-DD string by N days. */
function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12))
  return dt.toLocaleDateString('en-CA', { timeZone: 'UTC' })
}

/** Format a date range label like "Mar 30 – Apr 5, 2026". */
function weekLabel(startStr: string, endStr: string): string {
  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const s = new Date(Date.UTC(sy, sm - 1, sd, 12))
  const e = new Date(Date.UTC(ey, em - 1, ed, 12))
  const start = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const end = e.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${start} – ${end}`
}

/** Format a month label like "March 2026". */
function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Compute the previous full week (Mon–Sun) relative to today in the given timezone. */
function prevWeekRange(timezone: string): {
  weekStartStr: string
  weekEndStr: string
  label: string
  weekStart: Date
  weekEnd: Date
} {
  const todayStr = todayInTz(timezone)
  // "today" is Monday when this job runs; prev week = today-7 (Mon) to today-1 (Sun)
  const weekStartStr = offsetDate(todayStr, -7)
  const weekEndStr = offsetDate(todayStr, -1)
  return {
    weekStartStr,
    weekEndStr,
    label: weekLabel(weekStartStr, weekEndStr),
    weekStart: localDayToUtc(weekStartStr, timezone).start,
    weekEnd: localDayToUtc(weekEndStr, timezone).end,
  }
}

/** Compute the previous full calendar month relative to today. */
function prevMonthRange(timezone: string): {
  monthStart: Date
  monthEnd: Date
  monthStr: string
  label: string
  monthStartStr: string
} {
  const todayStr = todayInTz(timezone)
  const [y, m] = todayStr.split('-').map(Number)
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  const monthStartStr = `${prevY}-${String(prevM).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate()
  const monthEndStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const monthStr = `${prevY}-${String(prevM).padStart(2, '0')}`
  return {
    monthStart: localDayToUtc(monthStartStr, timezone).start,
    monthEnd: localDayToUtc(monthEndStr, timezone).end,
    monthStr,
    label: monthLabel(monthStr),
    monthStartStr,
  }
}

/** Send emails in batches of batchSize with delayMs between batches. */
async function sendInBatches<T>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(fn))
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

// ─── Job handlers ──────────────────────────────────────────────────────────

async function handleWeeklyUserReport(orgId: string, appUrl: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, name: true },
  })
  if (!org) return

  const tz = org.timezone || 'UTC'
  const { weekStart, weekEnd, label, weekStartStr } = prevWeekRange(tz)

  const users = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
  })
  if (users.length === 0) return

  const sessions = await prisma.timeSession.findMany({
    where: {
      org_id: orgId,
      user_id: { in: users.map((u) => u.id) },
      started_at: { gte: weekStart, lte: weekEnd },
      ended_at: { not: null },
      duration_sec: { gt: 0 },
    },
    select: {
      user_id: true,
      started_at: true,
      duration_sec: true,
      project: { select: { name: true } },
    },
  })

  const streaks = await prisma.streak.findMany({
    where: { user_id: { in: users.map((u) => u.id) } },
    select: { user_id: true, current_streak: true },
  })
  const streakMap = new Map(streaks.map((s) => [s.user_id, s.current_streak]))

  const dashboardLink = `${appUrl.replace(/\/$/, '')}/myhome`

  await sendInBatches(users, 50, 100, async (user) => {
    const userSessions = sessions.filter((s) => s.user_id === user.id)
    const totalSeconds = userSessions.reduce((sum, s) => sum + s.duration_sec, 0)

    // Top project by duration
    const projectSecs = new Map<string, number>()
    for (const s of userSessions) {
      if (s.project?.name) {
        projectSecs.set(s.project.name, (projectSecs.get(s.project.name) ?? 0) + s.duration_sec)
      }
    }
    const topProject =
      projectSecs.size > 0 ? [...projectSecs.entries()].sort((a, b) => b[1] - a[1])[0][0] : null

    // Daily breakdown
    const dayMap = new Map<string, number>()
    for (let i = 0; i < 7; i++) {
      dayMap.set(offsetDate(weekStartStr, i), 0)
    }
    for (const s of userSessions) {
      const dayStr = s.started_at.toLocaleDateString('en-CA', { timeZone: tz })
      if (dayMap.has(dayStr)) {
        dayMap.set(dayStr, (dayMap.get(dayStr) ?? 0) + s.duration_sec)
      }
    }
    const dailyBreakdown = Array.from(dayMap.entries()).map(([date, seconds]) => ({
      date,
      seconds,
    }))

    const html = weeklyUserReportHtml({
      userName: user.name,
      dateRange: label,
      totalSeconds,
      currentStreak: streakMap.get(user.id) ?? 0,
      topProject,
      dailyBreakdown,
      dashboardLink,
    })

    const result = await sendEmail({
      to: user.email,
      subject: `Your TrackSync week: ${label}`,
      html,
    })
    if (!result.success && result.error !== 'RESEND_API_KEY not configured') {
      console.warn(
        `[reportEmailWorker] weekly-user-report failed for ${user.email}: ${result.error}`
      )
    }
  })
}

async function handleWeeklyManagerReport(orgId: string, appUrl: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, name: true },
  })
  if (!org) return

  const tz = org.timezone || 'UTC'
  const { weekStart, weekEnd, label } = prevWeekRange(tz)

  const managers = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE', role: { in: ['MANAGER', 'ADMIN', 'OWNER'] } },
    select: { id: true, name: true, email: true },
  })
  if (managers.length === 0) return

  // All team members
  const allUsers = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE' },
    select: { id: true, name: true },
  })

  const sessions = await prisma.timeSession.findMany({
    where: {
      org_id: orgId,
      started_at: { gte: weekStart, lte: weekEnd },
      ended_at: { not: null },
      duration_sec: { gt: 0 },
    },
    select: { user_id: true, duration_sec: true },
  })

  const offlineTimes = await prisma.offlineTime.findMany({
    where: {
      org_id: orgId,
      status: 'APPROVED',
      start_time: { gte: weekStart },
      end_time: { lte: weekEnd },
    },
    select: { start_time: true, end_time: true },
  })

  const perUserSecs = new Map<string, number>()
  for (const s of sessions) {
    perUserSecs.set(s.user_id, (perUserSecs.get(s.user_id) ?? 0) + s.duration_sec)
  }

  const teamTotalSeconds = [...perUserSecs.values()].reduce((a, b) => a + b, 0)

  const perUserBreakdown = allUsers.map((u) => ({
    name: u.name,
    seconds: perUserSecs.get(u.id) ?? 0,
  }))

  const topPerformer =
    perUserBreakdown.length > 0 ? perUserBreakdown.sort((a, b) => b.seconds - a.seconds)[0] : null

  const offlineTimeUsedSeconds = offlineTimes.reduce((sum, ot) => {
    return sum + Math.round((ot.end_time.getTime() - ot.start_time.getTime()) / 1000)
  }, 0)

  const dashboardLink = `${appUrl.replace(/\/$/, '')}/myhome`

  await sendInBatches(managers, 50, 100, async (manager) => {
    const html = weeklyManagerReportHtml({
      managerName: manager.name,
      orgName: org.name,
      dateRange: label,
      teamTotalSeconds,
      perUserBreakdown,
      topPerformerName: topPerformer && topPerformer.seconds > 0 ? topPerformer.name : null,
      offlineTimeUsedSeconds,
      dashboardLink,
    })

    const result = await sendEmail({
      to: manager.email,
      subject: `Team report for ${org.name}: ${label}`,
      html,
    })
    if (!result.success && result.error !== 'RESEND_API_KEY not configured') {
      console.warn(
        `[reportEmailWorker] weekly-manager-report failed for ${manager.email}: ${result.error}`
      )
    }
  })
}

async function handleMonthlyManagerReport(orgId: string, appUrl: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, name: true },
  })
  if (!org) return

  const tz = org.timezone || 'UTC'
  const { monthStart, monthEnd, label } = prevMonthRange(tz)

  const managers = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE', role: { in: ['MANAGER', 'ADMIN', 'OWNER'] } },
    select: { id: true, name: true, email: true },
  })
  if (managers.length === 0) return

  const allUsers = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE' },
    select: { id: true, name: true },
  })

  const sessions = await prisma.timeSession.findMany({
    where: {
      org_id: orgId,
      started_at: { gte: monthStart, lte: monthEnd },
      ended_at: { not: null },
      duration_sec: { gt: 0 },
    },
    select: { user_id: true, duration_sec: true },
  })

  const offlineTimes = await prisma.offlineTime.findMany({
    where: {
      org_id: orgId,
      status: 'APPROVED',
      start_time: { gte: monthStart },
      end_time: { lte: monthEnd },
    },
    select: { start_time: true, end_time: true },
  })

  const perUserSecs = new Map<string, number>()
  for (const s of sessions) {
    perUserSecs.set(s.user_id, (perUserSecs.get(s.user_id) ?? 0) + s.duration_sec)
  }

  const teamTotalSeconds = [...perUserSecs.values()].reduce((a, b) => a + b, 0)

  const perUserBreakdown = allUsers.map((u) => ({
    name: u.name,
    seconds: perUserSecs.get(u.id) ?? 0,
  }))

  const topPerformer =
    perUserBreakdown.length > 0
      ? [...perUserBreakdown].sort((a, b) => b.seconds - a.seconds)[0]
      : null

  const offlineTimeUsedSeconds = offlineTimes.reduce((sum, ot) => {
    return sum + Math.round((ot.end_time.getTime() - ot.start_time.getTime()) / 1000)
  }, 0)

  const dashboardLink = `${appUrl.replace(/\/$/, '')}/myhome`

  await sendInBatches(managers, 50, 100, async (manager) => {
    const html = weeklyManagerReportHtml({
      managerName: manager.name,
      orgName: org.name,
      dateRange: label,
      teamTotalSeconds,
      perUserBreakdown,
      topPerformerName: topPerformer && topPerformer.seconds > 0 ? topPerformer.name : null,
      offlineTimeUsedSeconds,
      dashboardLink,
    })

    const result = await sendEmail({
      to: manager.email,
      subject: `Monthly team report for ${org.name}: ${label}`,
      html,
    })
    if (!result.success && result.error !== 'RESEND_API_KEY not configured') {
      console.warn(
        `[reportEmailWorker] monthly-manager-report failed for ${manager.email}: ${result.error}`
      )
    }
  })
}

async function handleMonthlyAdminReport(orgId: string, appUrl: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, name: true },
  })
  if (!org) return

  const tz = org.timezone || 'UTC'
  const { monthStart, monthEnd, label } = prevMonthRange(tz)

  const admins = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'OWNER'] } },
    select: { id: true, name: true, email: true },
  })
  if (admins.length === 0) return

  const [totalUsers, activeUsers, newUsers, sessions, integrations] = await Promise.all([
    prisma.user.count({ where: { org_id: orgId } }),
    prisma.user.count({ where: { org_id: orgId, status: 'ACTIVE' } }),
    prisma.user.count({
      where: { org_id: orgId, created_at: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.timeSession.findMany({
      where: {
        org_id: orgId,
        started_at: { gte: monthStart, lte: monthEnd },
        ended_at: { not: null },
        duration_sec: { gt: 0 },
      },
      select: { duration_sec: true },
    }),
    prisma.integration.findMany({
      where: { org_id: orgId },
      select: { name: true, type: true, status: true, last_sync_at: true },
    }),
  ])

  const orgTotalSeconds = sessions.reduce((sum, s) => sum + s.duration_sec, 0)

  const integrationStatuses = integrations.map((intg) => {
    let status: 'active' | 'error' | 'disconnected'
    if (intg.status === 'active' && intg.last_sync_at) {
      status = 'active'
    } else if (intg.status === 'error') {
      status = 'error'
    } else {
      status = 'disconnected'
    }
    return { name: intg.name || intg.type, status }
  })

  const dashboardLink = `${appUrl.replace(/\/$/, '')}/myhome`

  await sendInBatches(admins, 50, 100, async (admin) => {
    const html = monthlyAdminReportHtml({
      adminName: admin.name,
      orgName: org.name,
      monthLabel: label,
      orgTotalSeconds,
      userCount: totalUsers,
      activeUserCount: activeUsers,
      newUserCount: newUsers,
      integrationStatuses,
      dashboardLink,
    })

    const result = await sendEmail({
      to: admin.email,
      subject: `Admin monthly report — ${org.name}: ${label}`,
      html,
    })
    if (!result.success && result.error !== 'RESEND_API_KEY not configured') {
      console.warn(
        `[reportEmailWorker] monthly-admin-report failed for ${admin.email}: ${result.error}`
      )
    }
  })
}

async function handlePaymentDueNotice(
  orgId: string,
  appUrl: string,
  payload?: { planName?: string; amountDue?: string; dueDate?: string }
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, plan: true, trial_ends_at: true },
  })
  if (!org) return

  const admins = await prisma.user.findMany({
    where: { org_id: orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'OWNER'] } },
    select: { id: true, name: true, email: true },
  })
  if (admins.length === 0) return

  const billingLink = `${appUrl.replace(/\/$/, '')}/myhome/organization/settings`
  const planName = payload?.planName ?? org.plan
  const amountDue = payload?.amountDue ?? 'See billing portal'
  const dueDate =
    payload?.dueDate ??
    (org.trial_ends_at
      ? org.trial_ends_at.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'Upcoming')

  await sendInBatches(admins, 50, 100, async (admin) => {
    const html = paymentDueNoticeHtml({
      adminName: admin.name,
      planName,
      amountDue,
      dueDate,
      billingLink,
    })

    const result = await sendEmail({
      to: admin.email,
      subject: `Action required: Payment due for your TrackSync ${planName} plan`,
      html,
    })
    if (!result.success && result.error !== 'RESEND_API_KEY not configured') {
      console.warn(
        `[reportEmailWorker] payment-due-notice failed for ${admin.email}: ${result.error}`
      )
    }
  })
}

// ─── Worker factory ────────────────────────────────────────────────────────

export function reportEmailWorker(config: Config): Worker {
  return new Worker(
    'report-emails',
    async (
      job: Job<{ orgId: string; planName?: string; amountDue?: string; dueDate?: string }>
    ) => {
      const { orgId } = job.data
      if (!orgId) {
        console.warn(`[reportEmailWorker] job ${job.name} missing orgId`)
        return
      }

      switch (job.name) {
        case 'weekly-user-report':
          await handleWeeklyUserReport(orgId, config.APP_URL)
          break
        case 'weekly-manager-report':
          await handleWeeklyManagerReport(orgId, config.APP_URL)
          break
        case 'monthly-manager-report':
          await handleMonthlyManagerReport(orgId, config.APP_URL)
          break
        case 'monthly-admin-report':
          await handleMonthlyAdminReport(orgId, config.APP_URL)
          break
        case 'payment-due-notice':
          await handlePaymentDueNotice(orgId, config.APP_URL, job.data)
          break
        default:
          console.warn(`[reportEmailWorker] unknown job name: ${job.name}`)
      }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 2,
    }
  )
}
