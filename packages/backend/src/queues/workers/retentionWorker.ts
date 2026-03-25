import { Worker } from 'bullmq'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'
import { deleteFromS3 } from '../../lib/s3.js'

export function retentionWorker(config: Config): Worker {
  return new Worker(
    'retention',
    async () => {
      // Load all active orgs with their retention settings
      const orgs = await prisma.organization.findMany({
        where: { status: 'active' },
        include: { org_settings: true },
      })

      let deleted = 0
      const errors: string[] = []

      for (const org of orgs) {
        const retentionDays = org.org_settings?.screenshot_retention_days ?? 30
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - retentionDays)

        // Find expired screenshots (not yet soft-deleted)
        const expired = await prisma.screenshot.findMany({
          where: {
            org_id: org.id,
            taken_at: { lt: cutoff },
            deleted_at: null,
          },
          select: { id: true, s3_key: true, thumb_s3_key: true },
          take: 1000,
        })

        for (const screenshot of expired) {
          try {
            let lastErr: unknown
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                if (screenshot.thumb_s3_key) {
                  await deleteFromS3(config, screenshot.thumb_s3_key).catch(() => {})
                }
                await deleteFromS3(config, screenshot.s3_key)
                lastErr = undefined
                break
              } catch (e) {
                lastErr = e
                if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
              }
            }
            if (lastErr) throw lastErr
            await prisma.screenshot.update({
              where: { id: screenshot.id },
              data: { deleted_at: new Date() },
            })
            deleted++
          } catch (err) {
            errors.push(
              `Failed to delete screenshot ${screenshot.id}: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
      }

      return { deleted, errors }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 1,
    }
  )
}
