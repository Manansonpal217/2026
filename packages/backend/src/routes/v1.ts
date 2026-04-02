import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import {
  loginRoutes,
  refreshRoutes,
  logoutRoutes,
  meRoutes,
  signupRoutes,
  verifyEmailRoutes,
  passwordResetRoutes,
  inviteRoutes,
  mfaRoutes,
} from './auth/index.js'
import { projectRoutes } from './projects/index.js'
import { taskRoutes } from './tasks/index.js'
import { sessionCreateRoutes } from './sessions/create.js'
import { sessionListRoutes } from './sessions/list.js'
import { sessionUpdateRoutes } from './sessions/update.js'
import { sessionApproveRoutes } from './sessions/approve.js'
import { sessionAdminEditRoutes } from './sessions/edit.js'
import { userRoutes } from './users/index.js'
// Phase 3
import { screenshotUploadRoutes } from './screenshots/upload.js'
import { screenshotConfirmRoutes } from './screenshots/confirm.js'
import { screenshotListRoutes } from './screenshots/list.js'
import { screenshotFileRoutes } from './screenshots/file.js'
import { activitySyncRoutes } from './activity/sync.js'
// Phase 4
import { integrationConnectRoutes } from './integrations/connect.js'
import { integrationCallbackRoutes } from './integrations/callback.js'
import { integrationListRoutes } from './integrations/list.js'
import { integrationDeleteRoutes } from './integrations/delete.js'
import { integrationSyncRoutes } from './integrations/sync.js'
import { jiraIssuesSearchRoutes } from './integrations/jira-issues-search.js'
// Phase 5
import { timeReportRoutes } from './reports/time.js'
import { activityReportRoutes } from './reports/activity.js'
import { exportReportRoutes } from './reports/export.js'
import { adminUserRoutes } from './admin/users.js'
import { adminSettingsRoutes } from './admin/settings.js'
import { adminAuditLogRoutes } from './admin/audit-log.js'
import { adminStreaksRoutes } from './admin/streaks.js'
import { adminAnalyticsRoutes } from './admin/analytics.js'
import { dashboardTeamSummaryRoutes } from './dashboard/team-summary.js'
import { platformOrgRoutes } from './platform/orgs.js'
import { platformAnalyticsRoutes } from './platform/analytics.js'
import { offlineTimeRoutes } from './offline-time.js'
import { agentRoutes } from './agent/index.js'
import { adminAgentRoutes } from './admin/agent.js'
import { teamRoutes } from './teams/index.js'

export async function v1Routes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

  // ── Auth ──────────────────────────────────────────────────────────────────────
  fastify.register(signupRoutes, { prefix: '/public/auth', config })
  fastify.register(verifyEmailRoutes, { prefix: '/public/auth', config })
  fastify.register(passwordResetRoutes, { prefix: '/public/auth', config })
  fastify.register(inviteRoutes, { prefix: '/public/auth', config })
  fastify.register(loginRoutes, { prefix: '/app/auth', config })
  fastify.register(refreshRoutes, { prefix: '/app/auth', config })
  fastify.register(logoutRoutes, { prefix: '/app/auth', config })
  fastify.register(meRoutes, { prefix: '/app/auth', config })
  fastify.register(mfaRoutes, { prefix: '/app/auth', config })

  // ── Projects + Tasks ──────────────────────────────────────────────────────────
  fastify.register(projectRoutes, { prefix: '/projects', config })
  fastify.register(taskRoutes, { prefix: '/projects', config })

  // ── Time Sessions ─────────────────────────────────────────────────────────────
  fastify.register(sessionCreateRoutes, { prefix: '/sessions', config })
  fastify.register(sessionListRoutes, { prefix: '/sessions', config })
  fastify.register(sessionUpdateRoutes, { prefix: '/sessions', config })
  fastify.register(sessionApproveRoutes, { prefix: '/sessions', config })
  fastify.register(sessionAdminEditRoutes, { prefix: '/sessions', config })

  // ── Users ─────────────────────────────────────────────────────────────────────
  fastify.register(userRoutes, { prefix: '/users', config })

  // ── Teams ─────────────────────────────────────────────────────────────────────
  fastify.register(teamRoutes, { prefix: '/teams', config })

  // ── Dashboard ────────────────────────────────────────────────────────────────
  fastify.register(dashboardTeamSummaryRoutes, { prefix: '/dashboard', config })

  // ── Phase 3: Screenshots + Activity ──────────────────────────────────────────
  fastify.register(screenshotUploadRoutes, { prefix: '/screenshots', config })
  fastify.register(screenshotConfirmRoutes, { prefix: '/screenshots', config })
  fastify.register(screenshotFileRoutes, { prefix: '/screenshots', config })
  fastify.register(screenshotListRoutes, { prefix: '/screenshots', config })
  fastify.register(offlineTimeRoutes, { prefix: '/offline-time', config })
  fastify.register(activitySyncRoutes, { prefix: '/activity', config })

  // ── Phase 4: Integrations ─────────────────────────────────────────────────────
  fastify.register(integrationConnectRoutes, { prefix: '/integrations', config })
  fastify.register(integrationCallbackRoutes, { prefix: '/integrations', config })
  fastify.register(integrationListRoutes, { prefix: '/integrations', config })
  fastify.register(integrationDeleteRoutes, { prefix: '/integrations', config })
  fastify.register(integrationSyncRoutes, { prefix: '/integrations', config })
  fastify.register(jiraIssuesSearchRoutes, { prefix: '/integrations/jira', config })

  // ── Phase 5: Reports + Admin ──────────────────────────────────────────────────
  fastify.register(timeReportRoutes, { prefix: '/reports', config })
  fastify.register(activityReportRoutes, { prefix: '/reports', config })
  fastify.register(exportReportRoutes, { prefix: '/reports', config })
  fastify.register(adminUserRoutes, { prefix: '/admin', config })
  fastify.register(adminSettingsRoutes, { prefix: '/admin', config })
  fastify.register(adminAuditLogRoutes, { prefix: '/admin', config })
  fastify.register(adminStreaksRoutes, { prefix: '/admin', config })
  fastify.register(adminAnalyticsRoutes, { prefix: '/admin', config })
  fastify.register(adminAgentRoutes, { prefix: '/admin', config })

  // ── Agent (Bearer agent token) ───────────────────────────────────────────────
  fastify.register(agentRoutes, { prefix: '/agent', config })

  // Platform (cross-tenant): requires User.is_platform_admin
  fastify.register(platformOrgRoutes, { prefix: '/platform', config })
  fastify.register(platformAnalyticsRoutes, { prefix: '/platform', config })
}
