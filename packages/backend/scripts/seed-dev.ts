#!/usr/bin/env npx tsx
/**
 * Development seed: wipes ALL data and re-seeds with rich dummy data.
 *
 * Platform super admin:  manan@admin.com / manan
 * Org admin (Acme Corp): manan@admin.com / manan  (same account, is OWNER)
 *
 * MFA trick: mfa_enabled=true but no secret stored → login never triggers
 * MFA challenge, but requirePlatformAdmin() middleware check passes.
 *
 * Run:  pnpm --filter backend exec tsx scripts/seed-dev.ts
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Load .env manually so tsx doesn't need dotenv
const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { subDays, subHours, startOfDay, addHours } from 'date-fns'

const prisma = new PrismaClient()
const HASH = (p: string) => bcrypt.hash(p, 10)

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function uuid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

/* ── Wipe ─────────────────────────────────────────────────────────────────── */
async function wipe() {
  console.log('Wiping database…')
  // Order respects FK constraints
  const tables = [
    'SessionTimeDeduction',
    'AuditLog',
    'ActivityLog',
    'Screenshot',
    'TimeSession',
    'Task',
    'Project',
    'OAuthState',
    'Integration',
    'JiraIssue',
    'AgentCommand',
    'AgentHeartbeat',
    'AgentToken',
    'Invite',
    'RefreshToken',
    'Notification',
    'UserSettingsOverride',
    'Streak',
    'OfflineTime',
    'TeamMember',
    'Team',
    'User',
    'OrgSettings',
    'Organization',
  ]
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tables.join('","')}" CASCADE`)
  console.log('  All tables truncated.\n')
}

/* ── Main seed ────────────────────────────────────────────────────────────── */
async function main() {
  await wipe()

  const pass = await HASH('manan')
  const empPass = await HASH('pass1234')

  // ── Organizations ──────────────────────────────────────────────────────────

  const acme = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme',
      plan: 'STANDARD',
      status: 'ACTIVE',
      timezone: 'America/New_York',
    },
  })

  const startup = await prisma.organization.create({
    data: {
      name: 'Startup XYZ',
      slug: 'startup-xyz',
      plan: 'TRIAL',
      status: 'ACTIVE',
      timezone: 'America/Los_Angeles',
      trial_ends_at: new Date(Date.now() + 18 * 86_400_000), // 18 days
    },
  })

  const enterprise = await prisma.organization.create({
    data: {
      name: 'Enterprise Co',
      slug: 'enterprise-co',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      timezone: 'Europe/London',
    },
  })

  // OrgSettings
  await prisma.orgSettings.createMany({
    data: [
      {
        org_id: acme.id,
        screenshot_interval_seconds: 600,
        screenshot_retention_days: 60,
        blur_screenshots: false,
        track_app_usage: true,
        expected_daily_work_minutes: 480,
      },
      {
        org_id: startup.id,
        screenshot_interval_seconds: 300,
        screenshot_retention_days: 30,
        expected_daily_work_minutes: 360,
      },
      {
        org_id: enterprise.id,
        screenshot_interval_seconds: 900,
        screenshot_retention_days: 90,
        mfa_required_for_admins: true,
        expected_daily_work_minutes: 540,
      },
    ],
  })

  // ── Users — Acme Corp ──────────────────────────────────────────────────────

  const manan = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'manan@admin.com',
      password_hash: pass,
      name: 'Manan Sonpal',
      role: 'OWNER',
      status: 'ACTIVE',
      is_platform_admin: true,
      // mfa_enabled=true but no secret → skips challenge, passes requirePlatformAdmin()
      mfa_enabled: true,
      timezone: 'America/New_York',
    },
  })

  const sarah = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'sarah@acme.com',
      password_hash: empPass,
      name: 'Sarah Chen',
      role: 'ADMIN',
      status: 'ACTIVE',
      timezone: 'America/New_York',
    },
  })

  const john = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'john@acme.com',
      password_hash: empPass,
      name: 'John Martinez',
      role: 'MANAGER',
      status: 'ACTIVE',
      timezone: 'America/Chicago',
      manager_id: manan.id,
    },
  })

  const alice = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'alice@acme.com',
      password_hash: empPass,
      name: 'Alice Johnson',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      timezone: 'America/Chicago',
      manager_id: john.id,
    },
  })

  const bob = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'bob@acme.com',
      password_hash: empPass,
      name: 'Bob Williams',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      timezone: 'America/Los_Angeles',
      manager_id: john.id,
    },
  })

  const eve = await prisma.user.create({
    data: {
      org_id: acme.id,
      email: 'eve@acme.com',
      password_hash: empPass,
      name: 'Eve Thompson',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      timezone: 'America/New_York',
      manager_id: sarah.id,
    },
  })

  // Update manager_id for manan (make sarah his admin)
  await prisma.user.update({ where: { id: sarah.id }, data: { manager_id: manan.id } })

  // ── Users — Startup XYZ ────────────────────────────────────────────────────

  const startupOwner = await prisma.user.create({
    data: {
      org_id: startup.id,
      email: 'founder@startup-xyz.com',
      password_hash: empPass,
      name: 'Priya Kapoor',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  })

  const _startupDev = await prisma.user.create({
    data: {
      org_id: startup.id,
      email: 'dev@startup-xyz.com',
      password_hash: empPass,
      name: 'Raj Patel',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      manager_id: startupOwner.id,
    },
  })

  // ── Users — Enterprise Co ──────────────────────────────────────────────────

  const entOwner = await prisma.user.create({
    data: {
      org_id: enterprise.id,
      email: 'cto@enterprise-co.com',
      password_hash: empPass,
      name: 'David Kim',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  })

  const _entAdmin = await prisma.user.create({
    data: {
      org_id: enterprise.id,
      email: 'admin@enterprise-co.com',
      password_hash: empPass,
      name: 'Lisa Wang',
      role: 'ADMIN',
      status: 'ACTIVE',
      manager_id: entOwner.id,
    },
  })

  console.log('  Users created.')

  // ── Teams ──────────────────────────────────────────────────────────────────

  const engTeam = await prisma.team.create({
    data: {
      org_id: acme.id,
      name: 'Engineering',
      manager_id: john.id,
    },
  })

  const designTeam = await prisma.team.create({
    data: {
      org_id: acme.id,
      name: 'Design & Product',
      manager_id: sarah.id,
    },
  })

  await prisma.teamMember.createMany({
    data: [
      { team_id: engTeam.id, user_id: john.id, team_role: 'LEAD' },
      { team_id: engTeam.id, user_id: alice.id, team_role: 'MEMBER' },
      { team_id: engTeam.id, user_id: bob.id, team_role: 'MEMBER' },
      { team_id: designTeam.id, user_id: sarah.id, team_role: 'LEAD' },
      { team_id: designTeam.id, user_id: eve.id, team_role: 'MEMBER' },
      { team_id: designTeam.id, user_id: manan.id, team_role: 'MEMBER' },
    ],
  })

  console.log('  Teams created.')

  // ── Projects ───────────────────────────────────────────────────────────────

  const p1 = await prisma.project.create({
    data: { org_id: acme.id, name: 'Website Redesign', color: '#6366f1', budget_hours: 200 },
  })
  const p2 = await prisma.project.create({
    data: { org_id: acme.id, name: 'Mobile App v2', color: '#10b981', budget_hours: 500 },
  })
  const p3 = await prisma.project.create({
    data: { org_id: acme.id, name: 'API Platform', color: '#f59e0b', budget_hours: 300 },
  })
  const p4 = await prisma.project.create({
    data: { org_id: acme.id, name: 'Internal Tools', color: '#8b5cf6', budget_hours: 120 },
  })
  const _p5 = await prisma.project.create({
    data: { org_id: acme.id, name: 'Data Analytics', color: '#ec4899', archived: true },
  })

  // Startup project
  const _sp1 = await prisma.project.create({
    data: { org_id: startup.id, name: 'MVP Launch', color: '#3b82f6' },
  })

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const acmeUsers = [manan, sarah, john, alice, bob, eve]
  const allProjects = [p1, p2, p3, p4]
  const taskNames: Record<string, string[]> = {
    [p1.id]: [
      'Homepage redesign',
      'Navigation overhaul',
      'Mobile responsive CSS',
      'Dark mode support',
      'SEO metadata',
      'Performance audit',
      'Accessibility fixes',
    ],
    [p2.id]: [
      'Auth screens',
      'Push notifications',
      'Offline sync',
      'Camera integration',
      'App store assets',
      'Beta testing',
      'Performance profiling',
    ],
    [p3.id]: [
      'REST API auth',
      'Rate limiting',
      'GraphQL layer',
      'Webhooks system',
      'SDK generation',
      'API docs',
      'Load testing',
    ],
    [p4.id]: ['HR portal', 'Expense tracker', 'Admin dashboard', 'Slack bot'],
  }

  const allTasks = []
  for (const proj of allProjects) {
    const names = taskNames[proj.id] ?? ['Task A', 'Task B']
    for (let i = 0; i < names.length; i++) {
      const task = await prisma.task.create({
        data: {
          project_id: proj.id,
          org_id: acme.id,
          name: names[i],
          status: pick(['open', 'open', 'in_progress', 'in_progress', 'done']),
          external_id: `ACME-${proj.name.slice(0, 3).toUpperCase()}-${100 + i}`,
          assignee_user_id: pick(acmeUsers).id,
        },
      })
      allTasks.push(task)
    }
  }

  console.log('  Projects & tasks created.')

  // ── Time Sessions (30 days of data) ───────────────────────────────────────

  const activeAcmeUsers = [manan, sarah, john, alice, bob, eve]
  const devices = [
    { id: 'mac-pro-1', name: 'MacBook Pro' },
    { id: 'win-dev-1', name: 'Windows Dev' },
    { id: 'linux-1', name: 'Ubuntu Workstation' },
  ]

  const allSessions = []
  for (const user of activeAcmeUsers) {
    const dev = pick(devices)
    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      // Skip weekends roughly
      const dayOfWeek = new Date(Date.now() - daysAgo * 86_400_000).getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) continue
      if (Math.random() < 0.15) continue // ~15% chance of missing a day

      // 2-4 sessions per day
      const numSessions = rand(2, 4)
      let cursor = startOfDay(subDays(new Date(), daysAgo))
      cursor = addHours(cursor, rand(8, 10)) // Start ~8-10am

      for (let s = 0; s < numSessions; s++) {
        const durMin = rand(25, 110)
        const startedAt = cursor
        const endedAt = new Date(cursor.getTime() + durMin * 60_000)
        const proj = pick(allProjects)
        const projTasks = allTasks.filter((t) => t.project_id === proj.id)

        const session = await prisma.timeSession.create({
          data: {
            user_id: user.id,
            org_id: acme.id,
            project_id: proj.id,
            task_id: projTasks.length > 0 ? pick(projTasks).id : null,
            device_id: dev.id,
            device_name: dev.name,
            started_at: startedAt,
            ended_at: endedAt,
            duration_sec: durMin * 60,
            approval_status: 'APPROVED',
          },
        })
        allSessions.push(session)

        // Activity logs for session
        for (let min = 0; min < durMin; min += 5) {
          await prisma.activityLog.create({
            data: {
              session_id: session.id,
              user_id: user.id,
              org_id: acme.id,
              window_start: new Date(startedAt.getTime() + min * 60_000),
              window_end: new Date(startedAt.getTime() + (min + 5) * 60_000),
              keyboard_events: rand(30, 200),
              mouse_clicks: rand(5, 80),
              mouse_distance_px: rand(500, 8000),
              active_app: pick([
                'VS Code',
                'Chrome',
                'Slack',
                'Figma',
                'Terminal',
                'Zoom',
                'Notion',
                'Safari',
              ]),
              active_url: pick([
                null,
                'github.com',
                'localhost:3000',
                'jira.atlassian.net',
                'docs.google.com',
              ]),
              activity_score: Math.random() * 0.4 + 0.5, // 0.5 - 0.9
            },
          })
        }

        cursor = new Date(endedAt.getTime() + rand(15, 60) * 60_000) // break between sessions
      }
    }
  }

  // Today's active session for john (ongoing)
  const todayStart = new Date()
  todayStart.setHours(9, 0, 0, 0)
  await prisma.timeSession.create({
    data: {
      user_id: john.id,
      org_id: acme.id,
      project_id: p2.id,
      device_id: 'mac-pro-1',
      device_name: 'MacBook Pro',
      started_at: todayStart,
      ended_at: null, // still running
      duration_sec: Math.floor((Date.now() - todayStart.getTime()) / 1000),
      approval_status: 'APPROVED',
    },
  })

  console.log(`  Time sessions created (${allSessions.length} sessions).`)

  // ── Streaks ────────────────────────────────────────────────────────────────

  await prisma.streak.createMany({
    data: [
      { user_id: manan.id, current_streak: 12, longest_streak: 28, last_active_date: new Date() },
      { user_id: sarah.id, current_streak: 7, longest_streak: 21, last_active_date: new Date() },
      { user_id: john.id, current_streak: 4, longest_streak: 15, last_active_date: new Date() },
      { user_id: alice.id, current_streak: 9, longest_streak: 9, last_active_date: new Date() },
      { user_id: bob.id, current_streak: 2, longest_streak: 18, last_active_date: new Date() },
      {
        user_id: eve.id,
        current_streak: 0,
        longest_streak: 12,
        last_active_date: subDays(new Date(), 2),
      },
    ],
  })

  console.log('  Streaks created.')

  // ── Offline Time ───────────────────────────────────────────────────────────

  const offlineData = [
    // Alice — approved
    {
      org_id: acme.id,
      user_id: alice.id,
      requested_by_id: alice.id,
      approver_id: john.id,
      source: 'REQUEST' as const,
      status: 'APPROVED' as const,
      start_time: subDays(new Date(), 5),
      end_time: new Date(subDays(new Date(), 5).getTime() + 4 * 3600_000),
      description: 'Doctor appointment',
      approver_note: 'Take care!',
    },
    // Bob — pending
    {
      org_id: acme.id,
      user_id: bob.id,
      requested_by_id: bob.id,
      source: 'REQUEST' as const,
      status: 'PENDING' as const,
      start_time: subDays(new Date(), 1),
      end_time: new Date(subDays(new Date(), 1).getTime() + 3 * 3600_000),
      description: 'Family event',
      expires_at: new Date(Date.now() + 29 * 86_400_000),
    },
    // Eve — rejected
    {
      org_id: acme.id,
      user_id: eve.id,
      requested_by_id: eve.id,
      approver_id: sarah.id,
      source: 'REQUEST' as const,
      status: 'REJECTED' as const,
      start_time: subDays(new Date(), 10),
      end_time: new Date(subDays(new Date(), 10).getTime() + 8 * 3600_000),
      description: 'Vacation request',
      approver_note: 'We have a sprint deadline that week. Please reschedule.',
    },
    // John — direct add by manan
    {
      org_id: acme.id,
      user_id: john.id,
      requested_by_id: manan.id,
      approver_id: manan.id,
      source: 'DIRECT_ADD' as const,
      status: 'APPROVED' as const,
      start_time: subDays(new Date(), 3),
      end_time: new Date(subDays(new Date(), 3).getTime() + 4 * 3600_000),
      description: 'Client offsite meeting',
      approver_note: 'Self-approved by Admin',
    },
    // Alice — another pending
    {
      org_id: acme.id,
      user_id: alice.id,
      requested_by_id: alice.id,
      source: 'REQUEST' as const,
      status: 'PENDING' as const,
      start_time: new Date(Date.now() + 2 * 86_400_000),
      end_time: new Date(Date.now() + 2 * 86_400_000 + 4 * 3600_000),
      description: 'Moving apartment',
      expires_at: new Date(Date.now() + 30 * 86_400_000),
    },
  ]

  await prisma.offlineTime.createMany({ data: offlineData })

  console.log('  Offline time entries created.')

  // ── Notifications ──────────────────────────────────────────────────────────

  await prisma.notification.createMany({
    data: [
      {
        org_id: acme.id,
        user_id: john.id,
        type: 'OFFLINE_TIME_SUBMITTED',
        payload: {
          requester_name: 'Bob Williams',
          date: new Date(subDays(new Date(), 1)).toLocaleDateString(),
          hours: 3,
          offline_time_id: uuid('ot'),
        },
        created_at: subHours(new Date(), 2),
      },
      {
        org_id: acme.id,
        user_id: john.id,
        type: 'OFFLINE_TIME_SUBMITTED',
        payload: {
          requester_name: 'Alice Johnson',
          date: new Date(Date.now() + 2 * 86_400_000).toLocaleDateString(),
          hours: 4,
          offline_time_id: uuid('ot'),
        },
        created_at: subHours(new Date(), 1),
      },
      {
        org_id: acme.id,
        user_id: alice.id,
        type: 'OFFLINE_TIME_APPROVED',
        payload: {
          approver_name: 'John Martinez',
          date: new Date(subDays(new Date(), 5)).toLocaleDateString(),
        },
        read_at: new Date(),
        created_at: subDays(new Date(), 5),
      },
      {
        org_id: acme.id,
        user_id: eve.id,
        type: 'OFFLINE_TIME_REJECTED',
        payload: {
          approver_name: 'Sarah Chen',
          date: new Date(subDays(new Date(), 10)).toLocaleDateString(),
          note: 'We have a sprint deadline that week.',
        },
        created_at: subDays(new Date(), 9),
      },
      {
        org_id: acme.id,
        user_id: manan.id,
        type: 'PAYMENT_DUE',
        payload: {
          plan: 'STANDARD',
          date: new Date(Date.now() + 5 * 86_400_000).toLocaleDateString(),
        },
        created_at: subDays(new Date(), 1),
      },
    ],
  })

  console.log('  Notifications created.')

  // ── Audit Log ──────────────────────────────────────────────────────────────

  await prisma.auditLog.createMany({
    data: [
      {
        org_id: acme.id,
        actor_id: manan.id,
        action: 'setting.changed',
        target_type: 'org_settings',
        target_id: acme.id,
        new_value: { screenshot_interval_seconds: 600 },
        ip_address: '192.168.1.1',
        created_at: subDays(new Date(), 7),
      },
      {
        org_id: acme.id,
        actor_id: sarah.id,
        action: 'user.invited',
        target_type: 'user',
        target_id: alice.id,
        new_value: { email: 'alice@acme.com', role: 'EMPLOYEE' },
        ip_address: '192.168.1.2',
        created_at: subDays(new Date(), 15),
      },
      {
        org_id: acme.id,
        actor_id: manan.id,
        action: 'user.role_changed',
        target_type: 'user',
        target_id: john.id,
        old_value: { role: 'EMPLOYEE' },
        new_value: { role: 'MANAGER' },
        ip_address: '192.168.1.1',
        created_at: subDays(new Date(), 20),
      },
      {
        org_id: acme.id,
        actor_id: manan.id,
        action: 'integration.connected',
        target_type: 'integration',
        target_id: uuid('int'),
        new_value: { provider: 'jira' },
        ip_address: '192.168.1.1',
        created_at: subDays(new Date(), 3),
      },
      {
        org_id: acme.id,
        actor_id: sarah.id,
        action: 'security.mfa_enabled',
        target_type: 'user',
        target_id: sarah.id,
        new_value: { user: 'sarah@acme.com' },
        ip_address: '192.168.1.2',
        created_at: subDays(new Date(), 10),
      },
      {
        org_id: acme.id,
        actor_id: manan.id,
        action: 'user.suspended',
        target_type: 'user',
        target_id: uuid('u'),
        old_value: { status: 'ACTIVE' },
        new_value: { status: 'SUSPENDED' },
        ip_address: '192.168.1.1',
        created_at: subDays(new Date(), 2),
      },
      {
        org_id: acme.id,
        actor_id: john.id,
        action: 'offline_time.approved',
        target_type: 'offline_time',
        target_id: uuid('ot'),
        new_value: { user: 'alice@acme.com', hours: 4 },
        ip_address: '192.168.1.5',
        created_at: subDays(new Date(), 5),
      },
    ],
  })

  console.log('  Audit log entries created.')

  // ── User Settings Overrides ────────────────────────────────────────────────

  await prisma.userSettingsOverride.createMany({
    data: [
      {
        org_id: acme.id,
        user_id: alice.id,
        feature_key: 'ss_capture_interval_seconds',
        value: '300',
      },
      { org_id: acme.id, user_id: bob.id, feature_key: 'ss_blur_allowed', value: 'true' },
      {
        org_id: acme.id,
        user_id: bob.id,
        feature_key: 'ss_capture_interval_seconds',
        value: '900',
      },
    ],
  })

  console.log('  User overrides created.\n')

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════════')
  console.log('  Seed complete!')
  console.log('═══════════════════════════════════════════════════')
  console.log('')
  console.log('  Platform Super Admin (& Acme OWNER):')
  console.log('    Email:    manan@admin.com')
  console.log('    Password: manan')
  console.log('    → Logs into /admin/dashboard (platform view)')
  console.log('    → Also has full access to /myhome (Acme Corp)')
  console.log('')
  console.log('  Other Acme Corp logins (password: pass1234):')
  console.log('    sarah@acme.com  — Admin')
  console.log('    john@acme.com   — Manager')
  console.log('    alice@acme.com  — Employee')
  console.log('    bob@acme.com    — Employee')
  console.log('    eve@acme.com    — Employee')
  console.log('')
  console.log('  Other orgs (password: pass1234):')
  console.log('    founder@startup-xyz.com  — Startup XYZ / OWNER (TRIAL)')
  console.log('    cto@enterprise-co.com    — Enterprise Co / OWNER (PROFESSIONAL)')
  console.log('')
  console.log('  Orgs: Acme Corp, Startup XYZ, Enterprise Co')
  console.log('  Data: 30d time sessions, streaks, offline time, notifications, audit log')
  console.log('═══════════════════════════════════════════════════')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
