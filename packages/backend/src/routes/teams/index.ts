import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import {
  createAuthenticateMiddleware,
  requireRole,
  requirePermission,
} from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { Permission } from '../../lib/permissions.js'

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  manager_id: z.string().uuid().optional(),
})

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  manager_id: z.string().uuid().nullable().optional(),
})

const membershipSchema = z.object({
  user_id: z.string().uuid(),
  team_role: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
})

export async function teamRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // ── List teams ────────────────────────────────────────────────────────────────
  // OWNER, ADMIN: all teams. MANAGER: only teams they manage. VIEWER: all (read-only).
  fastify.get('/', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const where =
        user.role === 'MANAGER'
          ? { org_id: user.org_id, manager_id: user.id }
          : { org_id: user.org_id }

      const teams = await prisma.team.findMany({
        where,
        include: {
          manager: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
        orderBy: { created_at: 'asc' },
      })

      return { teams }
    },
  })

  // ── Get single team ───────────────────────────────────────────────────────────
  fastify.get('/:id', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const team = await prisma.team.findFirst({
        where: { id, org_id: user.org_id },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      })

      if (!team) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      }

      // MANAGER can only view their own team
      if (user.role === 'MANAGER' && team.manager_id !== user.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      return { team }
    },
  })

  // ── Create team ───────────────────────────────────────────────────────────────
  fastify.post('/', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = createTeamSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      if (body.data.manager_id) {
        const mgr = await prisma.user.findFirst({
          where: {
            id: body.data.manager_id,
            org_id: user.org_id,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
          },
          select: { id: true },
        })
        if (!mgr) {
          return reply.status(400).send({
            code: 'INVALID_MANAGER',
            message: 'Manager must be an active OWNER, ADMIN, or MANAGER',
          })
        }
      }

      const team = await prisma.team.create({
        data: {
          org_id: user.org_id,
          name: body.data.name,
          manager_id: body.data.manager_id ?? null,
        },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          members: true,
        },
      })

      return reply.status(201).send({ team })
    },
  })

  // ── Update team ───────────────────────────────────────────────────────────────
  fastify.patch('/:id', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const body = updateTeamSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const team = await prisma.team.findFirst({ where: { id, org_id: user.org_id } })
      if (!team) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      }

      if (body.data.manager_id) {
        const mgr = await prisma.user.findFirst({
          where: {
            id: body.data.manager_id,
            org_id: user.org_id,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
          },
          select: { id: true },
        })
        if (!mgr) {
          return reply.status(400).send({
            code: 'INVALID_MANAGER',
            message: 'Manager must be an active OWNER, ADMIN, or MANAGER',
          })
        }
      }

      const updated = await prisma.team.update({
        where: { id },
        data: {
          ...(body.data.name !== undefined && { name: body.data.name }),
          ...(body.data.manager_id !== undefined && { manager_id: body.data.manager_id }),
        },
        include: {
          manager: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      })

      return { team: updated }
    },
  })

  // ── Delete team ───────────────────────────────────────────────────────────────
  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const team = await prisma.team.findFirst({ where: { id, org_id: user.org_id } })
      if (!team) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      }

      await prisma.team.delete({ where: { id } })

      return reply.status(204).send()
    },
  })

  // ── Add member ────────────────────────────────────────────────────────────────
  fastify.post('/:id/members', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const body = membershipSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const team = await prisma.team.findFirst({ where: { id, org_id: user.org_id } })
      if (!team) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      }

      // MANAGERs can only manage their own team
      if (user.role === 'MANAGER' && team.manager_id !== user.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const targetUser = await prisma.user.findFirst({
        where: { id: body.data.user_id, org_id: user.org_id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!targetUser) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const member = await prisma.teamMember.upsert({
        where: { team_id_user_id: { team_id: id, user_id: body.data.user_id } },
        create: {
          team_id: id,
          user_id: body.data.user_id,
          team_role: body.data.team_role,
        },
        update: { team_role: body.data.team_role },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      return reply.status(201).send({ member })
    },
  })

  // ── Remove member ─────────────────────────────────────────────────────────────
  fastify.delete('/:id/members/:userId', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id, userId } = request.params as { id: string; userId: string }

      const team = await prisma.team.findFirst({ where: { id, org_id: user.org_id } })
      if (!team) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      }

      if (user.role === 'MANAGER' && team.manager_id !== user.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const existing = await prisma.teamMember.findUnique({
        where: { team_id_user_id: { team_id: id, user_id: userId } },
      })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Member not found in team' })
      }

      await prisma.teamMember.delete({
        where: { team_id_user_id: { team_id: id, user_id: userId } },
      })

      return reply.status(204).send()
    },
  })
}
