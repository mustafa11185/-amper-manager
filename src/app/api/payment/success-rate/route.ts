// Per-day, per-gateway success/failure counts for the last N days. Used by
// /staff/online-transactions to render a stacked bar chart so the owner can
// see at a glance "Qi failing more than usual on Thursday."

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Bucket = { success: number; failed: number; pending: number; expired: number; refunded: number }
const EMPTY: Bucket = { success: 0, failed: 0, pending: 0, expired: 0, refunded: 0 }

function dayKey(d: Date): string {
  // YYYY-MM-DD in the server's local TZ (Render runs UTC; staff page renders
  // in user TZ — close enough for trend visibility, exact accounting lives
  // in the transaction list below the chart).
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  if (!tenantId) return NextResponse.json({ error: 'no tenant' }, { status: 400 })

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 14)))
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (days - 1))

  const rows = await prisma.onlinePayment.findMany({
    where: { tenant_id: tenantId, created_at: { gte: since } },
    select: { gateway: true, status: true, created_at: true },
  })

  const dayLabels: string[] = []
  const cursor = new Date(since)
  for (let i = 0; i < days; i++) {
    dayLabels.push(dayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  // shape: { [gateway]: { [day]: Bucket } }
  const grid: Record<string, Record<string, Bucket>> = {}
  for (const r of rows) {
    const g = r.gateway || 'unknown'
    const d = dayKey(r.created_at)
    grid[g] ??= {}
    grid[g][d] ??= { ...EMPTY }
    const status = r.status as keyof Bucket
    if (status in grid[g][d]) grid[g][d][status] += 1
  }

  const series = Object.entries(grid).map(([gateway, days]) => {
    const points = dayLabels.map(d => ({ day: d, ...(days[d] ?? EMPTY) }))
    const totalAttempts = points.reduce((s, p) => s + p.success + p.failed + p.expired, 0)
    const totalSuccess = points.reduce((s, p) => s + p.success, 0)
    return {
      gateway,
      points,
      success_rate: totalAttempts > 0 ? totalSuccess / totalAttempts : null,
      total_attempts: totalAttempts,
    }
  }).sort((a, b) => b.total_attempts - a.total_attempts)

  return NextResponse.json({ days: dayLabels, series })
}
