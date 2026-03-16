import { Worker } from 'bullmq'
import type { Config } from '../../config.js'

export function budgetAlertWorker(config: Config): Worker {
  return new Worker(
    'budget-alert',
    async () => {
      const { prisma } = await import('../../db/prisma.js')
      const { sendEmail } = await import('../../lib/email.js')

      // Projects with a budget_hours limit
      const projects = await prisma.project.findMany({
        where: { budget_hours: { not: null }, archived: false },
        include: { organization: { include: { users: { where: { role: 'admin' } } } } },
      })

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      for (const project of projects) {
        const budgetSec = (project.budget_hours ?? 0) * 3600
        if (budgetSec === 0) continue

        const aggregate = await prisma.timeSession.aggregate({
          where: {
            project_id: project.id,
            approval_status: 'approved',
            started_at: { gte: monthStart },
            ended_at: { not: null },
          },
          _sum: { duration_sec: true },
        })

        const usedSec = aggregate._sum.duration_sec ?? 0
        const percent = (usedSec / budgetSec) * 100

        const adminEmails = project.organization.users
          .map((u) => u.email)
          .filter(Boolean)

        if (adminEmails.length === 0) continue

        const usedHours = (usedSec / 3600).toFixed(1)
        const budgetHours = project.budget_hours!.toFixed(1)

        if (percent >= 100) {
          for (const email of adminEmails) {
            await sendEmail(config, {
              to: email,
              subject: `[TrackSync] Project "${project.name}" is over budget`,
              text: `Project "${project.name}" has used ${usedHours}h of its ${budgetHours}h monthly budget (${percent.toFixed(0)}%). Please review.`,
            }).catch((e) => console.error(`budgetAlert email failed: ${e}`))
          }
        } else if (percent >= 80) {
          for (const email of adminEmails) {
            await sendEmail(config, {
              to: email,
              subject: `[TrackSync] Project "${project.name}" is at ${percent.toFixed(0)}% of budget`,
              text: `Project "${project.name}" has used ${usedHours}h of its ${budgetHours}h monthly budget. You may want to review.`,
            }).catch((e) => console.error(`budgetAlert email failed: ${e}`))
          }
        }
      }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 1,
    },
  )
}
