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
// Productivity reports
import { productivitySummaryRoutes } from './reports/productivity/summary.js'
import { productivityAppBreakdownRoutes } from './reports/productivity/app-breakdown.js'
import { productivityHourlyHeatmapRoutes } from './reports/productivity/hourly-heatmap.js'
import { productivityIdleTimeRoutes } from './reports/productivity/idle-time.js'
import { productivityStreaksRoutes } from './reports/productivity/streaks.js'
// Attendance reports
import { attendanceDailyLogRoutes } from './reports/attendance/daily-log.js'
import { attendanceLateStartRoutes } from './reports/attendance/late-start.js'
import { attendanceOfflineTimeRoutes } from './reports/attendance/offline-time.js'
import { attendanceOvertimeRoutes } from './reports/attendance/overtime.js'
import { attendanceAbsenteeismRoutes } from './reports/attendance/absenteeism.js'
// Project reports
import { projectAllocationRoutes } from './reports/projects/allocation.js'
import { projectBudgetRoutes } from './reports/projects/budget-vs-actuals.js'
import { projectTaskAccuracyRoutes } from './reports/projects/task-accuracy.js'
import { projectUserContributionRoutes } from './reports/projects/user-contribution.js'
// Compliance reports
import { complianceScreenshotAuditRoutes } from './reports/compliance/screenshot-audit.js'
import { complianceManualTimeRoutes } from './reports/compliance/manual-time.js'
import { complianceAuditLogRoutes } from './reports/compliance/audit-log.js'
import { complianceDataRetentionRoutes } from './reports/compliance/data-retention.js'
// Billing reports
import { billingBillableHoursRoutes } from './reports/billing/billable-hours.js'
import { billingCostEstimateRoutes } from './reports/billing/cost-estimate.js'
import { billingSeatUtilizationRoutes } from './reports/billing/seat-utilization.js'
import { adminUserRoutes } from './admin/users.js'
import { adminSettingsRoutes } from './admin/settings.js'
import { adminAuditLogRoutes } from './admin/audit-log.js'
import { adminStreaksRoutes } from './admin/streaks.js'
import { adminAnalyticsRoutes } from './admin/analytics.js'
import { dashboardTeamSummaryRoutes } from './dashboard/team-summary.js'
import { platformOrgRoutes } from './platform/orgs.js'
import { platformAnalyticsRoutes } from './platform/analytics.js'
import { platformBillingRoutes } from './platform/billing.js'
import { appDashboardRoutes } from './app/dashboard.js'
import { offlineTimeRoutes } from './offline-time.js'
import { adminOfflineTimeRoutes } from './admin/offline-time.js'
import { appSettingsRoutes } from './app/settings.js'
import { notificationRoutes } from './notifications/index.js'
import { agentRoutes } from './agent/index.js'
import { adminAgentRoutes } from './admin/agent.js'
import { adminInviteRoutes } from './admin/invites.js'
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
  fastify.register(appSettingsRoutes, { prefix: '/app/settings', config })
  fastify.register(notificationRoutes, { prefix: '/app/notifications', config })
  fastify.register(appDashboardRoutes, { prefix: '/app', config })

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
  fastify.register(offlineTimeRoutes, { prefix: '/app/offline-time', config })
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
  // Productivity reports
  fastify.register(productivitySummaryRoutes, { prefix: '/reports', config })
  fastify.register(productivityAppBreakdownRoutes, { prefix: '/reports', config })
  fastify.register(productivityHourlyHeatmapRoutes, { prefix: '/reports', config })
  fastify.register(productivityIdleTimeRoutes, { prefix: '/reports', config })
  fastify.register(productivityStreaksRoutes, { prefix: '/reports', config })
  // Attendance reports
  fastify.register(attendanceDailyLogRoutes, { prefix: '/reports', config })
  fastify.register(attendanceLateStartRoutes, { prefix: '/reports', config })
  fastify.register(attendanceOfflineTimeRoutes, { prefix: '/reports', config })
  fastify.register(attendanceOvertimeRoutes, { prefix: '/reports', config })
  fastify.register(attendanceAbsenteeismRoutes, { prefix: '/reports', config })
  // Project reports
  fastify.register(projectAllocationRoutes, { prefix: '/reports', config })
  fastify.register(projectBudgetRoutes, { prefix: '/reports', config })
  fastify.register(projectTaskAccuracyRoutes, { prefix: '/reports', config })
  fastify.register(projectUserContributionRoutes, { prefix: '/reports', config })
  // Compliance reports
  fastify.register(complianceScreenshotAuditRoutes, { prefix: '/reports', config })
  fastify.register(complianceManualTimeRoutes, { prefix: '/reports', config })
  fastify.register(complianceAuditLogRoutes, { prefix: '/reports', config })
  fastify.register(complianceDataRetentionRoutes, { prefix: '/reports', config })
  // Billing reports
  fastify.register(billingBillableHoursRoutes, { prefix: '/reports', config })
  fastify.register(billingCostEstimateRoutes, { prefix: '/reports', config })
  fastify.register(billingSeatUtilizationRoutes, { prefix: '/reports', config })
  fastify.register(adminUserRoutes, { prefix: '/admin', config })
  fastify.register(adminSettingsRoutes, { prefix: '/admin', config })
  fastify.register(adminAuditLogRoutes, { prefix: '/admin', config })
  fastify.register(adminStreaksRoutes, { prefix: '/admin', config })
  fastify.register(adminAnalyticsRoutes, { prefix: '/admin', config })
  fastify.register(adminAgentRoutes, { prefix: '/admin', config })
  fastify.register(adminOfflineTimeRoutes, { prefix: '/admin', config })
  fastify.register(adminInviteRoutes, { prefix: '/admin', config })

  // ── Agent (Bearer agent token) ───────────────────────────────────────────────
  fastify.register(agentRoutes, { prefix: '/agent', config })

  // Platform (cross-tenant): requires User.is_platform_admin
  fastify.register(platformOrgRoutes, { prefix: '/platform', config })
  fastify.register(platformAnalyticsRoutes, { prefix: '/platform', config })
  fastify.register(platformBillingRoutes, { prefix: '/platform', config })
}
