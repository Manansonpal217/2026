import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

function projectKeyFromJiraKey(key: string): string {
  const i = key.indexOf('-')
  return i > 0 ? key.slice(0, i) : key
}

export async function jiraIssuesSearchRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/issues/search', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const query = request.query as { q?: string; assigneeFilter?: string }
      const q = (query.q ?? '').trim()
      if (q.length < 2) {
        return reply
          .status(400)
          .send({ code: 'VALIDATION_ERROR', message: 'Query must be at least 2 characters' })
      }

      const assigneeFilter = query.assigneeFilter === 'me' ? 'me' : 'all'
      const email = req.user!.email

      const rows = await prisma.jiraIssue.findMany({
        where: {
          org_id: req.user!.org_id,
          ...(assigneeFilter === 'me'
            ? { assignee_email: { equals: email, mode: 'insensitive' as const } }
            : {}),
          OR: [
            { key: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updated_at: 'desc' },
        take: 15,
      })

      const issues = rows.map((row) => {
        const raw = row.raw_payload as Record<string, unknown> | null
        const fields = raw?.fields as Record<string, unknown> | undefined
        const issuetype = fields?.issuetype as { name?: string } | undefined
        return {
          id: row.id,
          key: row.key,
          summary: row.summary ?? '',
          status: row.status ?? '',
          priority: row.priority ?? null,
          project: projectKeyFromJiraKey(row.key),
          issueType: typeof issuetype?.name === 'string' ? issuetype.name : '',
          url: '',
        }
      })

      return { issues }
    },
  })
}
