import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'
import { SETTINGS_PATCH_KEY_PERMISSION, Permission, hasPermission } from '../../lib/permissions.js'
import {
  orgSettingsScalarPatchSchema as patchSettingsSchema,
  assertActivityWeightsSum,
  GLOBAL_SCREENSHOT_RETENTION_DAYS,
  idleIntervalsFromMinutes,
} from '../../lib/org-settings-fields.js'
import { isOverridableKey, type OverridableKey } from '../../lib/settings.js'
import { registerOrgReportJobs } from '../../lib/report-jobs.js'

const BOOLEAN_OVERRIDE_KEYS: ReadonlySet<OverridableKey> = new Set([
  'ss_capture_enabled',
  'ss_delete_allowed',
  'ss_blur_allowed',
  'ss_click_notification_enabled',
  'jira_connected',
])

const NUMBER_OVERRIDE_KEYS: ReadonlySet<OverridableKey> = new Set([
  'ss_capture_interval_seconds',
  'expected_daily_work_minutes',
])

export async function adminSettingsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/settings', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const settings = await prisma.orgSettings.findFirst({
        where: { org_id: req.user!.org_id },
      })
      return {
        settings: settings
          ? { ...settings, screenshot_retention_days: GLOBAL_SCREENSHOT_RETENTION_DAYS }
          : settings,
      }
    },
  })

  const patchSettingsWithTimezone = patchSettingsSchema.extend({
    timezone: z.string().min(1).max(100).optional(),
  })

  fastify.patch('/settings', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = patchSettingsWithTimezone.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const { timezone, ...settingsData } = body.data
      let settingsDataWithRetention: Record<string, unknown> = {
        ...settingsData,
        screenshot_retention_days: GLOBAL_SCREENSHOT_RETENTION_DAYS,
      }
      if (settingsData.idle_timeout_minutes !== undefined) {
        settingsDataWithRetention = {
          ...settingsDataWithRetention,
          idle_timeout_intervals: idleIntervalsFromMinutes(settingsData.idle_timeout_minutes),
        }
      }

      for (const key of Object.keys(
        settingsDataWithRetention
      ) as (keyof typeof settingsDataWithRetention)[]) {
        if (settingsDataWithRetention[key] === undefined) continue
        const perm =
          SETTINGS_PATCH_KEY_PERMISSION[key as string] ?? Permission.SETTINGS_MANAGE_ADVANCED
        if (!hasPermission(user, perm)) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: `Not allowed to change setting: ${String(key)}`,
          })
        }
      }

      const existing = await prisma.orgSettings.findFirst({ where: { org_id: user.org_id } })
      try {
        assertActivityWeightsSum(settingsDataWithRetention, existing)
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (err.code === 'INVALID_WEIGHTS') {
          return reply.status(400).send({
            code: 'INVALID_WEIGHTS',
            message: err.message?.replace(/^INVALID_WEIGHTS: /, '') ?? 'Invalid weights',
          })
        }
        throw e
      }

      const oldValue = existing ?? {}

      // Update OrgSettings
      const updated = await prisma.orgSettings.upsert({
        where: { org_id: user.org_id },
        create: { org_id: user.org_id, ...settingsDataWithRetention },
        update: settingsDataWithRetention,
      })

      // Update Organization.timezone if provided
      let newTimezone: string | undefined
      if (timezone) {
        const updatedOrg = await prisma.organization.update({
          where: { id: user.org_id },
          data: { timezone },
          select: { timezone: true },
        })
        newTimezone = updatedOrg.timezone
        // Re-register report jobs with new timezone (fire-and-forget; failures are non-fatal)
        void registerOrgReportJobs(user.org_id, newTimezone).catch((err) =>
          console.error('[adminSettings] registerOrgReportJobs failed after TZ update', err)
        )
      }

      await logAuditEvent({
        orgId: user.org_id,
        actorId: user.id,
        action: 'setting.changed',
        targetType: 'org_settings',
        targetId: user.org_id,
        oldValue,
        newValue: { ...settingsDataWithRetention, ...(timezone ? { timezone } : {}) },
        ip: request.ip,
      })

      return {
        settings: { ...updated, screenshot_retention_days: GLOBAL_SCREENSHOT_RETENTION_DAYS },
        ...(newTimezone ? { timezone: newTimezone } : {}),
      }
    },
  })

  const userOverrideBodySchema = z.object({
    value: z.string().min(1).max(10_000),
  })

  fastify.put('/settings/users/:userId/:key', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const admin = req.user!
      const { userId, key } = request.params as { userId: string; key: string }

      if (!isOverridableKey(key)) {
        return reply.status(400).send({
          code: 'INVALID_KEY',
          message: 'Unknown feature key',
        })
      }

      const body = userOverrideBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      if (BOOLEAN_OVERRIDE_KEYS.has(key as OverridableKey)) {
        if (body.data.value !== 'true' && body.data.value !== 'false') {
          return reply.status(400).send({
            code: 'INVALID_VALUE',
            message: `Value for ${key} must be 'true' or 'false'`,
          })
        }
      } else if (NUMBER_OVERRIDE_KEYS.has(key as OverridableKey)) {
        const num = Number(body.data.value)
        if (!Number.isFinite(num)) {
          return reply.status(400).send({
            code: 'INVALID_VALUE',
            message: `Value for ${key} must be a valid number`,
          })
        }
      }

      const target = await prisma.user.findFirst({
        where: { id: userId, org_id: admin.org_id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!target) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const row = await prisma.userSettingsOverride.upsert({
        where: {
          org_id_user_id_feature_key: {
            org_id: admin.org_id,
            user_id: userId,
            feature_key: key,
          },
        },
        create: {
          id: randomUUID(),
          org_id: admin.org_id,
          user_id: userId,
          feature_key: key,
          value: body.data.value,
        },
        update: { value: body.data.value },
      })

      await logAuditEvent({
        orgId: admin.org_id,
        actorId: admin.id,
        action: 'user_settings_override.upsert',
        targetType: 'user_settings_override',
        targetId: row.id,
        oldValue: undefined,
        newValue: { user_id: userId, feature_key: key, value: body.data.value },
        ip: request.ip,
      })

      return { override: row }
    },
  })

  fastify.get('/settings/users/:userId', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const admin = req.user!
      const { userId } = request.params as { userId: string }

      const target = await prisma.user.findFirst({
        where: { id: userId, org_id: admin.org_id },
        select: { id: true },
      })
      if (!target) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const overrides = await prisma.userSettingsOverride.findMany({
        where: { org_id: admin.org_id, user_id: userId },
      })

      return { overrides }
    },
  })

  fastify.delete('/settings/users/:userId/:key', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const admin = req.user!
      const { userId, key } = request.params as { userId: string; key: string }

      if (!isOverridableKey(key)) {
        return reply.status(400).send({ code: 'INVALID_KEY', message: 'Unknown feature key' })
      }

      try {
        const deleted = await prisma.userSettingsOverride.delete({
          where: {
            org_id_user_id_feature_key: {
              org_id: admin.org_id,
              user_id: userId,
              feature_key: key,
            },
          },
        })

        await logAuditEvent({
          orgId: admin.org_id,
          actorId: admin.id,
          action: 'user_settings_override.delete',
          targetType: 'user_settings_override',
          targetId: deleted.id,
          oldValue: { user_id: userId, feature_key: key, value: deleted.value },
          newValue: undefined,
          ip: request.ip,
        })

        return { deleted: true }
      } catch (e: unknown) {
        const prismaErr = e as { code?: string }
        if (prismaErr.code === 'P2025') {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'Override not found' })
        }
        throw e
      }
    },
  })

  fastify.get('/settings/override-users', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const admin = req.user!

      const rows = await prisma.userSettingsOverride.groupBy({
        by: ['user_id'],
        where: { org_id: admin.org_id },
      })

      return { user_ids: rows.map((r) => r.user_id) }
    },
  })
}
