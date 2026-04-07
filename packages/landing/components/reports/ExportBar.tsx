'use client'

import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { isManagerOrAbove } from '@/lib/roles'
import { Button } from '@/components/ui/button'

type ExportBarProps = {
  reportType: string
  params: Record<string, string | string[] | undefined>
}

export function ExportBar({ reportType, params }: ExportBarProps) {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isViewer = role === 'VIEWER'

  const [csvLoading, setCsvLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isViewer) return null

  async function handleCsvExport() {
    setCsvLoading(true)
    setError(null)
    try {
      const cleanParams: Record<string, string> = { format: 'csv', report_type: reportType }
      for (const [k, v] of Object.entries(params)) {
        if (v) cleanParams[k] = Array.isArray(v) ? v.join(',') : v
      }
      const res = await api.get('/v1/reports/export', {
        params: cleanParams,
        responseType: 'blob',
      })
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('CSV export failed. Please try again.')
    } finally {
      setCsvLoading(false)
    }
  }

  async function handlePdfExport() {
    setPdfLoading(true)
    setError(null)
    try {
      const body: Record<string, string | string[]> = { report_type: reportType }
      for (const [k, v] of Object.entries(params)) {
        if (v) body[k] = v
      }
      const { data } = await api.post<{ jobId: string }>('/v1/reports/export/pdf', body)
      const jobId = data.jobId
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const { data: status } = await api.get<{ status: string; url?: string; error?: string }>(
          `/v1/reports/export/pdf/${jobId}`
        )
        if (status.status === 'completed' && status.url) {
          const a = document.createElement('a')
          a.href = status.url
          a.download = `${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`
          a.rel = 'noopener noreferrer'
          a.target = '_blank'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          return
        }
        if (status.status === 'failed') {
          setError(status.error ?? 'PDF export failed.')
          return
        }
      }
      setError('PDF export timed out.')
    } catch {
      setError('PDF export failed. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">Export</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleCsvExport()}
        disabled={csvLoading}
        className="gap-1.5"
      >
        {csvLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handlePdfExport()}
        disabled={pdfLoading}
        className="gap-1.5"
      >
        {pdfLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        PDF
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
