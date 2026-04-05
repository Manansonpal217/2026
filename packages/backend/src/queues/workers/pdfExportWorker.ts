import { Worker, type Job } from 'bullmq'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'
import { getDbRead } from '../../lib/db-read.js'
import { getS3Client } from '../../lib/s3.js'
import { timeApprovalTotalsFilter } from '../../lib/time-approval-scope.js'

export type PdfExportJobData = {
  userId: string
  orgId: string
  from: string
  to: string
  targetUserId: string
}

export type PdfExportJobResult = {
  status: 'completed' | 'failed'
  url?: string
  error?: string
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

function buildReportHtml(
  sessions: Array<{
    id: string
    started_at: Date
    ended_at: Date | null
    duration_sec: number
    project?: { name: string } | null
    user?: { name: string; email: string } | null
    task?: { name: string } | null
  }>,
  meta: { from: string; to: string; userName: string; totalSeconds: number }
): string {
  const rows = sessions
    .map((s) => {
      const date = s.started_at.toISOString().split('T')[0]
      const start = s.started_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const end = s.ended_at
        ? s.ended_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'Running'
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${date}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${secToHms(s.duration_sec)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${s.project?.name ?? 'No project'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${s.task?.name ?? ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${start} – ${end}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #1f2937; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .summary { display: flex; gap: 32px; margin-bottom: 24px; }
  .stat { padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2563eb; }
  .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 20px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; padding: 8px 12px; background: #f3f4f6; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
</style>
</head><body>
  <h1>Time Report</h1>
  <p class="meta">${meta.userName} · ${meta.from} to ${meta.to}</p>
  <div class="summary">
    <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${secToHms(meta.totalSeconds)}</div></div>
    <div class="stat"><div class="stat-label">Sessions</div><div class="stat-value">${sessions.length}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Date</th><th>Duration</th><th>Project</th><th>Task</th><th>Start / End</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`
}

export function pdfExportWorker(cfg: Config): Worker {
  return new Worker<PdfExportJobData, PdfExportJobResult>(
    'pdf-export',
    async (job: Job<PdfExportJobData>) => {
      const { userId: _userId, orgId, from, to, targetUserId } = job.data
      const db = getDbRead()

      try {
        const approvalFilter = await timeApprovalTotalsFilter(orgId)
        const sessions = await db.timeSession.findMany({
          where: {
            org_id: orgId,
            user_id: targetUserId,
            ended_at: { not: null },
            ...approvalFilter,
            started_at: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          },
          orderBy: { started_at: 'asc' },
          take: 5000,
          include: {
            user: { select: { name: true, email: true } },
            project: { select: { name: true } },
            task: { select: { name: true } },
          },
        })

        const totalSeconds = sessions.reduce((s, r) => s + r.duration_sec, 0)
        const user = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { name: true },
        })

        const html = buildReportHtml(sessions, {
          from: from.split('T')[0],
          to: to.split('T')[0],
          userName: user?.name ?? 'User',
          totalSeconds,
        })

        let pdfBuffer: Buffer

        try {
          const chromiumPath = process.env.CHROMIUM_PATH
          let browser

          if (chromiumPath) {
            const puppeteer = await import('puppeteer-core')
            browser = await puppeteer.default.launch({
              executablePath: chromiumPath,
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
            })
          } else {
            try {
              const chromium = await import('@sparticuz/chromium')
              const puppeteer = await import('puppeteer-core')
              browser = await puppeteer.default.launch({
                executablePath: await chromium.default.executablePath(),
                headless: true,
                args: chromium.default.args,
              })
            } catch {
              const puppeteer = await import('puppeteer-core')
              browser = await puppeteer.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
              })
            }
          }

          const page = await browser.newPage()
          await page.setContent(html, { waitUntil: 'networkidle0' })
          const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
          })
          await browser.close()
          pdfBuffer = Buffer.from(pdf)
        } catch (err) {
          console.error('[pdfExportWorker] Puppeteer error:', err)
          return { status: 'failed', error: 'PDF rendering failed. Chromium may not be available.' }
        }

        const s3Key = `reports/${orgId}/${randomUUID()}.pdf`
        const s3 = getS3Client(cfg)
        const bucket = cfg.S3_SCREENSHOT_BUCKET

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
          })
        )

        const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: s3Key }), {
          expiresIn: 300,
        })

        return { status: 'completed', url }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[pdfExportWorker] Error:', msg)
        return { status: 'failed', error: msg }
      }
    },
    {
      connection: { url: cfg.REDIS_URL },
      concurrency: 2,
      limiter: { max: 4, duration: 60_000 },
    }
  )
}
