import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = (session as { access_token?: string })?.access_token

  if (!accessToken) {
    return Response.json({ message: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { email, role } = body

  if (!email || typeof email !== 'string') {
    return Response.json({ message: 'Email is required' }, { status: 400 })
  }

  const res = await fetch(`${API_URL}/v1/public/auth/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email, role: role || 'employee' }),
  })

  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}
