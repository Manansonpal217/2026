#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
    },
  })

  const passwordHash = await bcrypt.hash('demo1234', 12)

  await prisma.orgSettings.upsert({
    where: { org_id: org.id },
    update: {},
    create: {
      org_id: org.id,
    },
  })

  const adminUser = await prisma.user.upsert({
    where: {
      email_org_id: { email: 'admin@demo.com', org_id: org.id },
    },
    update: { is_platform_admin: true },
    create: {
      org_id: org.id,
      email: 'admin@demo.com',
      password_hash: passwordHash,
      name: 'Demo Admin',
      role: 'OWNER',
      is_platform_admin: true,
    },
  })

  // Dummy projects
  const project1 = await prisma.project.upsert({
    where: { id: 'demo-project-1' },
    update: {},
    create: {
      id: 'demo-project-1',
      org_id: org.id,
      name: 'Website Redesign',
      color: '#6366f1',
    },
  })

  const project2 = await prisma.project.upsert({
    where: { id: 'demo-project-2' },
    update: {},
    create: {
      id: 'demo-project-2',
      org_id: org.id,
      name: 'Mobile App',
      color: '#10b981',
    },
  })

  const project3 = await prisma.project.upsert({
    where: { id: 'demo-project-3' },
    update: {},
    create: {
      id: 'demo-project-3',
      org_id: org.id,
      name: 'API Development',
      color: '#f59e0b',
    },
  })

  const project4 = await prisma.project.upsert({
    where: { id: 'demo-project-4' },
    update: {},
    create: {
      id: 'demo-project-4',
      org_id: org.id,
      name: 'Documentation',
      color: '#8b5cf6',
    },
  })

  // Dummy tasks for each project (with external_id for ticket search e.g. PROJ-123)
  const taskData = [
    {
      projectId: project1.id,
      tasks: [
        { name: 'Homepage layout', externalId: 'SITE-101' },
        { name: 'Navigation redesign', externalId: 'SITE-102' },
        { name: 'Footer component', externalId: 'SITE-103' },
        { name: 'Fix auth bug', externalId: 'SITE-104' },
      ],
    },
    {
      projectId: project2.id,
      tasks: [
        { name: 'Login screen', externalId: 'MOB-201' },
        { name: 'Dashboard UI', externalId: 'MOB-202' },
        { name: 'Settings page', externalId: 'MOB-203' },
        { name: 'Working on integration xyz', externalId: 'MOB-204' },
      ],
    },
    {
      projectId: project3.id,
      tasks: [
        { name: 'Auth endpoints', externalId: 'API-301' },
        { name: 'User API', externalId: 'API-302' },
        { name: 'Webhooks', externalId: 'API-303' },
        { name: 'Add rate limiting', externalId: 'API-304' },
      ],
    },
    {
      projectId: project4.id,
      tasks: [
        { name: 'API docs', externalId: 'DOC-401' },
        { name: 'README', externalId: 'DOC-402' },
        { name: 'Changelog', externalId: 'DOC-403' },
      ],
    },
  ]

  for (const { projectId, tasks } of taskData) {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      await prisma.task.upsert({
        where: { id: `demo-task-${projectId}-${i}` },
        update: {
          name: task.name,
          external_id: task.externalId,
          assignee_user_id: adminUser.id,
        },
        create: {
          id: `demo-task-${projectId}-${i}`,
          project_id: projectId,
          org_id: org.id,
          name: task.name,
          status: 'open',
          external_id: task.externalId,
          assignee_user_id: adminUser.id,
        },
      })
    }
  }

  console.log('Seed complete. Login with:', {
    email: 'admin@demo.com',
    password: 'demo1234',
    org_slug: 'demo',
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
