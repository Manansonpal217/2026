import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/prisma.js'
import { hashRefreshToken } from '../lib/password.js'

export interface AgentAuthenticatedRequest extends FastifyRequest {
  agentOrgId?: string
  agentTokenId?: string
}

export function createVerifyAgentMiddleware() {
  return async function verifyAgentToken(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const auth = request.headers.authorization
    const raw = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null
    if (!raw) {
      return reply.status(401).send({ code: 'NO_TOKEN', message: 'Authorization required' })
    }

    const tokenHash = hashRefreshToken(raw)
    const token = await prisma.agentToken.findUnique({
      where: { token_hash: tokenHash },
    })

    if (!token) {
      return reply.status(401).send({ code: 'INVALID_AGENT_TOKEN', message: 'Invalid agent token' })
    }

    const now = new Date()
    await prisma.agentToken.update({
      where: { id: token.id },
      data: { last_seen_at: now },
    })

    await prisma.agentHeartbeat.upsert({
      where: { org_id: token.org_id },
      create: { org_id: token.org_id, status: 'online', last_seen_at: now },
      update: { last_seen_at: now, status: 'online' },
    })

    const r = request as AgentAuthenticatedRequest
    r.agentOrgId = token.org_id
    r.agentTokenId = token.id
  }
}
