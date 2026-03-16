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

  await prisma.user.upsert({
    where: {
      email_org_id: { email: 'admin@demo.com', org_id: org.id },
    },
    update: {},
    create: {
      org_id: org.id,
      email: 'admin@demo.com',
      password_hash: passwordHash,
      name: 'Demo Admin',
      role: 'super_admin',
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

  // Dummy tasks for each project
  const taskData = [
    { projectId: project1.id, tasks: ['Homepage layout', 'Navigation redesign', 'Footer component'] },
    { projectId: project2.id, tasks: ['Login screen', 'Dashboard UI', 'Settings page'] },
    { projectId: project3.id, tasks: ['Auth endpoints', 'User API', 'Webhooks'] },
    { projectId: project4.id, tasks: ['API docs', 'README', 'Changelog'] },
  ]

  for (const { projectId, tasks } of taskData) {
    for (let i = 0; i < tasks.length; i++) {
      await prisma.task.upsert({
        where: { id: `demo-task-${projectId}-${i}` },
        update: {},
        create: {
          id: `demo-task-${projectId}-${i}`,
          project_id: projectId,
          org_id: org.id,
          name: tasks[i],
          status: 'open',
        },
      })
    }
  }

  console.log('Seed complete. Login with:', { email: 'admin@demo.com', password: 'demo1234', org_slug: 'demo' })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
