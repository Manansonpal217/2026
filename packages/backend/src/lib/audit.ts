import { prisma } from '../db/prisma.js'

export interface AuditEventArgs {
  orgId: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  oldValue?: unknown
  newValue?: unknown
  ip?: string
}

export async function logAuditEvent(args: AuditEventArgs): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        org_id: args.orgId,
        actor_id: args.actorId,
        action: args.action,
        target_type: args.targetType,
        target_id: args.targetId,
        old_value: args.oldValue !== undefined ? (args.oldValue as object) : undefined,
        new_value: args.newValue !== undefined ? (args.newValue as object) : undefined,
        ip_address: args.ip ?? null,
      },
    })
  } catch (err) {
    // Audit failures must never crash the main operation
    console.error('[audit] Failed to log audit event:', err)
  }
}
