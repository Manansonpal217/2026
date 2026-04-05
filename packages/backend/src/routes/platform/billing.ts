import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { getReportEmailQueue } from '../../queues/index.js'
import {
  createAuthenticateMiddleware,
  requirePlatformAdmin,
} from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function platformBillingRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/billing', {
    preHandler: [authenticate, requirePlatformAdmin()],
    handler: async (request: FastifyRequest) => {
      const q = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .safeParse(request.query)
      const { page, limit } = q.success ? q.data : { page: 1, limit: 50 }

      const [orgs, total] = await Promise.all([
        prisma.organization.findMany({
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            trial_ends_at: true,
            trial_expired: true,
            created_at: true,
            _count: { select: { users: true } },
          },
        }),
        prisma.organization.count(),
      ])

      return {
        orgs: orgs.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          status: o.status,
          trial_ends_at: o.trial_ends_at,
          trial_expired: o.trial_expired,
          user_count: o._count.users,
          created_at: o.created_at,
        })),
        total,
        page,
        limit,
      }
    },
  })

  fastify.patch('/billing/:orgId/paid', {
    preHandler: [authenticate, requirePlatformAdmin()],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true },
      })
      if (!org) return reply.status(404).send({ code: 'NOT_FOUND' })
      await prisma.organization.update({
        where: { id: orgId },
        data: { trial_expired: false },
      })
      return { ok: true }
    },
  })

  fastify.patch('/billing/:orgId/extend-trial', {
    preHandler: [authenticate, requirePlatformAdmin()],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const body = z
        .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
        .safeParse(request.body)
      const days = body.success ? body.data.days : 30
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true },
      })
      if (!org) return reply.status(404).send({ code: 'NOT_FOUND' })
      const newEnd = new Date(Date.now() + days * 86_400_000)
      await prisma.organization.update({
        where: { id: orgId },
        data: { trial_ends_at: newEnd, trial_expired: false },
      })
      return { ok: true, trial_ends_at: newEnd }
    },
  })

  fastify.post(
    '/billing/notify',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      // Find orgs where trial ends within 7 days and trial not yet expired
      const trialOrgs = await prisma.organization.findMany({
        where: {
          trial_ends_at: { gte: now, lte: sevenDaysFromNow },
          trial_expired: false,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          plan: true,
          trial_ends_at: true,
        },
      })

      // Find orgs on paid plans (monthly billing assumed on 1st — if today is the 1st)
      const todayDay = now.getUTCDate()
      const paidPlanOrgs =
        todayDay === 1
          ? await prisma.organization.findMany({
              where: {
                plan: { in: ['STANDARD', 'PROFESSIONAL'] },
                status: 'ACTIVE',
              },
              select: {
                id: true,
                name: true,
                plan: true,
                trial_ends_at: true,
              },
            })
          : []

      // De-duplicate by org id
      const orgMap = new Map<
        string,
        { id: string; name: string; plan: string; trial_ends_at: Date | null }
      >()
      for (const org of [...trialOrgs, ...paidPlanOrgs]) {
        if (!orgMap.has(org.id)) orgMap.set(org.id, org)
      }

      const affectedOrgs = [...orgMap.values()]
      if (affectedOrgs.length === 0) {
        return { orgs_notified: 0, notifications_created: 0 }
      }

      let notificationsCreated = 0
      const reportQueue = getReportEmailQueue()

      for (const org of affectedOrgs) {
        // Get all ADMIN/OWNER users in this org
        const admins = await prisma.user.findMany({
          where: { org_id: org.id, status: 'ACTIVE', role: { in: ['ADMIN', 'OWNER'] } },
          select: { id: true },
        })
        if (admins.length === 0) continue

        const dueDate = org.trial_ends_at
          ? org.trial_ends_at.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Upcoming'

        // Create PAYMENT_DUE notifications
        const notifications = admins.map((admin) => ({
          org_id: org.id,
          user_id: admin.id,
          type: 'PAYMENT_DUE' as const,
          payload: {
            plan: org.plan,
            due_date: dueDate,
            trial_ends_at: org.trial_ends_at?.toISOString() ?? null,
          },
        }))

        await prisma.notification.createMany({ data: notifications })
        notificationsCreated += notifications.length

        // Enqueue payment-due-notice email job
        await reportQueue.add(
          'payment-due-notice',
          {
            orgId: org.id,
            planName: org.plan,
            amountDue: 'See billing portal',
            dueDate,
          },
          { attempts: 2 }
        )
      }

      return {
        orgs_notified: affectedOrgs.length,
        notifications_created: notificationsCreated,
      }
    }
  )
}
