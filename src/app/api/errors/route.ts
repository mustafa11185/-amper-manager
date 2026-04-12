// POST /api/errors
//
// Receives error reports from the Flutter app. Stores the last 200
// in memory (visible via GET) and logs to console for Render's log
// viewer. No auth required — error reports must work even when the
// user's session is expired or corrupt.
//
// GET /api/errors — owner-only, returns the in-memory error log.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

type ErrorEntry = {
  error: string
  stack?: string
  user_id?: string
  role?: string
  tenant_id?: string
  timestamp: string
  platform: string
  received_at: string
}

const errorLog: ErrorEntry[] = []
const MAX_LOG = 200

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const entry: ErrorEntry = {
      error: String(body.error ?? '').slice(0, 500),
      stack: body.stack ? String(body.stack).slice(0, 2000) : undefined,
      user_id: body.user_id?.toString(),
      role: body.role?.toString(),
      tenant_id: body.tenant_id?.toString(),
      timestamp: body.timestamp?.toString() ?? new Date().toISOString(),
      platform: body.platform?.toString() ?? 'unknown',
      received_at: new Date().toISOString(),
    }

    errorLog.unshift(entry)
    if (errorLog.length > MAX_LOG) errorLog.length = MAX_LOG

    console.error(`[APP ERROR] ${entry.role ?? '?'}@${entry.tenant_id ?? '?'}: ${entry.error}`)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Never fail — even on bad input
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    count: errorLog.length,
    errors: errorLog,
  })
}
