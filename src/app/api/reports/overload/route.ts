import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Comprehensive overload report — affected generators + estimated lost revenue
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prisma.overloadEvent.findMany({
    where: { ...where, detected_at: { gte: since } },
    orderBy: { detected_at: 'desc' },
  })

  // Group by generator
  const byGen: Record<string, {
    name?: string
    incidents: number
    avg_excess_amps: number
    max_excess_amps: number
    avg_excess_pct: number
    estimated_lost_amps: number
  }> = {}

  for (const e of events) {
    const id = e.generator_id
    if (!byGen[id]) {
      byGen[id] = { incidents: 0, avg_excess_amps: 0, max_excess_amps: 0, avg_excess_pct: 0, estimated_lost_amps: 0 }
    }
    byGen[id].incidents++
    byGen[id].avg_excess_amps += e.excess_amps
    byGen[id].max_excess_amps = Math.max(byGen[id].max_excess_amps, e.excess_amps)
    byGen[id].avg_excess_pct += e.excess_pct
    byGen[id].estimated_lost_amps += e.excess_amps  // Cumulative
  }

  for (const gid of Object.keys(byGen)) {
    byGen[gid].avg_excess_amps /= byGen[gid].incidents
    byGen[gid].avg_excess_pct /= byGen[gid].incidents
  }

  // Attach generator names
  const genIds = Object.keys(byGen)
  if (genIds.length > 0) {
    const generators = await prisma.generator.findMany({
      where: { id: { in: genIds } },
      select: { id: true, name: true },
    })
    for (const g of generators) {
      if (byGen[g.id]) byGen[g.id].name = g.name
    }
  }

  // Estimate lost revenue: average price per amp * excess amps
  // Get average price per amp from billing settings (assumes ~3000 IQD/A/month for normal subscribers)
  const avgPricePerAmp = 3000
  const totalExcessAmps = events.reduce((s, e) => s + e.excess_amps, 0)
  const estimatedMonthlyLoss = avgPricePerAmp * (totalExcessAmps / events.length || 0)

  return NextResponse.json({
    period_days: days,
    summary: {
      total_incidents: events.length,
      affected_generators: Object.keys(byGen).length,
      avg_excess_amps: events.length > 0 ? events.reduce((s, e) => s + e.excess_amps, 0) / events.length : 0,
      max_excess_amps: events.reduce((m, e) => Math.max(m, e.excess_amps), 0),
      estimated_monthly_loss_iqd: estimatedMonthlyLoss,
    },
    by_generator: Object.entries(byGen)
      .map(([id, data]) => ({ generator_id: id, ...data }))
      .sort((a, b) => b.estimated_lost_amps - a.estimated_lost_amps),
    recent_events: events.slice(0, 50),
  })
}
