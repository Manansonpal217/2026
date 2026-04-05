import { Worker, type Job } from 'bullmq'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'
import { sendSSE } from '../../lib/sse.js'

const STALE_EXECUTING_MS = 5 * 60 * 1000
const OFFLINE_HEARTBEAT_MS = 2 * 60 * 1000

export function agentMaintenanceWorker(config: Config): Worker {
  return new Worker(
    'agent-maintenance',
    async (job: Job) => {
      if (job.name === 'stale-command-cleanup') {
        const cutoff = new Date(Date.now() - STALE_EXECUTING_MS)
        const result = await prisma.agentCommand.updateMany({
          where: {
            status: 'executing',
            locked_at: { lt: cutoff },
          },
          data: { status: 'pending', locked_at: null },
        })
        return { reset: result.count }
      }

      if (job.name === 'offline-check') {
        const cutoff = new Date(Date.now() - OFFLINE_HEARTBEAT_MS)
        const result = await prisma.agentHeartbeat.updateMany({
          where: {
            status: 'online',
            last_seen_at: { lt: cutoff },
          },
          data: { status: 'offline' },
        })
        return { marked_offline: result.count }
      }

      if (job.name === 'expire-offline-requests') {
        const now = new Date()
        const expiredRows = await prisma.offlineTime.findMany({
          where: { status: 'PENDING', expires_at: { lt: now } },
          select: {
            id: true,
            user_id: true,
            org_id: true,
            start_time: true,
            end_time: true,
            description: true,
          },
        })
        if (expiredRows.length === 0) return { expired: 0 }

        await prisma.offlineTime.updateMany({
          where: { id: { in: expiredRows.map((r) => r.id) } },
          data: { status: 'EXPIRED' },
        })

        await prisma.notification.createMany({
          data: expiredRows.map((r) => ({
            org_id: r.org_id,
            user_id: r.user_id,
            type: 'OFFLINE_TIME_EXPIRED' as const,
            payload: {
              offline_time_id: r.id,
              start_time: r.start_time.toISOString(),
              end_time: r.end_time.toISOString(),
              description: r.description,
            },
          })),
        })

        for (const r of expiredRows) {
          sendSSE(r.user_id, 'notification', {
            type: 'OFFLINE_TIME_EXPIRED',
            offline_time_id: r.id,
          })
        }

        return { expired: expiredRows.length }
      }

      if (job.name === 'calculate-streaks') {
        const users = await prisma.user.findMany({
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            organization: { select: { timezone: true } },
          },
        })

        let updated = 0
        let reset = 0

        for (const user of users) {
          const tz = user.organization.timezone || 'UTC'
          const now = new Date()

          // UTC offset for this timezone at this instant
          const localStr = now.toLocaleString('en-US', { timeZone: tz })
          const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
          const offsetMin = Math.round(
            (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000
          )

          // Yesterday's date string in user's timezone
          const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })
          const [ty, tm, td] = todayStr.split('-').map(Number)
          const yesterdayStr = new Date(Date.UTC(ty, tm - 1, td - 1, 12)).toLocaleDateString(
            'en-CA',
            { timeZone: 'UTC' }
          )
          const dayBeforeYesterdayStr = new Date(
            Date.UTC(ty, tm - 1, td - 2, 12)
          ).toLocaleDateString('en-CA', { timeZone: 'UTC' })

          // UTC bounds for "yesterday" in user's timezone
          const [yy, ym, yd] = yesterdayStr.split('-').map(Number)
          const dayStart = new Date(Date.UTC(yy, ym - 1, yd, 0, 0, 0) - offsetMin * 60000)
          const dayEnd = new Date(Date.UTC(yy, ym - 1, yd, 23, 59, 59, 999) - offsetMin * 60000)

          const activityCount = await prisma.timeSession.count({
            where: {
              user_id: user.id,
              started_at: { gte: dayStart, lte: dayEnd },
              ended_at: { not: null },
              duration_sec: { gt: 0 },
            },
          })

          const existing = await prisma.streak.findUnique({
            where: { user_id: user.id },
          })

          const lastActiveDateStr = existing?.last_active_date
            ? existing.last_active_date.toISOString().slice(0, 10)
            : null

          if (activityCount > 0) {
            // Idempotent: already processed yesterday
            if (lastActiveDateStr === yesterdayStr) continue

            let newStreak: number
            if (!lastActiveDateStr || lastActiveDateStr < dayBeforeYesterdayStr) {
              newStreak = 1
            } else if (lastActiveDateStr === dayBeforeYesterdayStr) {
              newStreak = (existing?.current_streak ?? 0) + 1
            } else {
              newStreak = 1
            }

            const newLongest = Math.max(existing?.longest_streak ?? 0, newStreak)

            await prisma.streak.upsert({
              where: { user_id: user.id },
              create: {
                user_id: user.id,
                current_streak: newStreak,
                longest_streak: newLongest,
                last_active_date: new Date(`${yesterdayStr}T00:00:00.000Z`),
              },
              update: {
                current_streak: newStreak,
                longest_streak: newLongest,
                last_active_date: new Date(`${yesterdayStr}T00:00:00.000Z`),
              },
            })
            updated++
          } else {
            // No activity yesterday
            if (!lastActiveDateStr) continue
            // Grace period: last active was the day before yesterday — today hasn't settled yet
            if (lastActiveDateStr === dayBeforeYesterdayStr) continue
            // Streak broken: last active was 2+ days ago
            if (lastActiveDateStr < dayBeforeYesterdayStr && (existing?.current_streak ?? 0) > 0) {
              await prisma.streak.update({
                where: { user_id: user.id },
                data: { current_streak: 0 },
              })
              reset++
            }
          }
        }

        return { users: users.length, updated, reset }
      }

      return { skipped: true, reason: `unknown job name: ${job.name}` }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 1,
    }
  )
}
