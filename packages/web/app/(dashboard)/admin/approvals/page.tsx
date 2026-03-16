'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { ApprovalQueue } from '@/components/ApprovalQueue'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface PendingSession {
  id: string
  user: { id: string; name: string; email: string }
  project?: { name: string; color: string } | null
  task?: { name: string } | null
  started_at: string
  ended_at: string
  duration_sec: number
  notes?: string | null
}

export default function ApprovalsPage() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<PendingSession[]>([])
  const [loading, setLoading] = useState(true)

  const token = (session as { access_token?: string })?.access_token

  async function fetchPending() {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/sessions/pending-approval?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setSessions((await res.json()).sessions)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPending() }, [token]) // eslint-disable-line

  async function handleApprove(id: string) {
    if (!token) return
    await fetch(`${API_URL}/v1/sessions/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleReject(id: string, reason: string) {
    if (!token) return
    await fetch(`${API_URL}/v1/sessions/${id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Time Approvals</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {loading ? '…' : `${sessions.length} pending approval`}
        </p>
      </div>

      <ApprovalQueue
        sessions={sessions}
        onApprove={handleApprove}
        onReject={handleReject}
        isLoading={loading}
      />
    </div>
  )
}
