import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

// Comprehensive fuel theft report — all events + patterns + per-generator breakdown
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const branchIds = await resolveBranchIds(req, user)
  const where: any = { tenant_id: tenantId, type: 'theft_suspected', branch_id: { in: branchIds } }

  // Time window
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prisma.fuelEvent.findMany({
    where: { ...where, occurred_at: { gte: since } },
    include: { device: { select: { id: true, name: true, generator_id: true } } },
    orderBy: { occurred_at: 'desc' },
  })

  // Stats
  const totalIncidents = events.length
  const totalLiters = events.reduce((s, e) => s + (Number(e.liters_est) || 0), 0)
  const totalCostIqd = events.reduce((s, e) => s + (Number(e.cost_est_iqd) || 0), 0)
  const resolved = events.filter(e => e.is_resolved).length

  // Time-of-day pattern (0-23)
  const hourlyPattern = Array.from({ length: 24 }, () => 0)
  for (const e of events) {
    const hour = (new Date(e.occurred_at).getUTCHours() + 3) % 24  // Iraq time
    hourlyPattern[hour]++
  }

  // Per-generator breakdown
  const byGenerator: Record<string, { count: number; liters: number; cost: number; name?: string }> = {}
  for (const e of events) {
    const gid = e.generator_id || 'unknown'
    if (!byGenerator[gid]) byGenerator[gid] = { count: 0, liters: 0, cost: 0 }
    byGenerator[gid].count++
    byGenerator[gid].liters += Number(e.liters_est) || 0
    byGenerator[gid].cost += Number(e.cost_est_iqd) || 0
  }
  // Attach generator names
  const genIds = Object.keys(byGenerator).filter(g => g !== 'unknown')
  if (genIds.length > 0) {
    const generators = await prisma.generator.findMany({
      where: { id: { in: genIds } },
      select: { id: true, name: true },
    })
    for (const g of generators) {
      if (byGenerator[g.id]) byGenerator[g.id].name = g.name
    }
  }

  // Day-of-week pattern
  const dayOfWeekPattern = Array.from({ length: 7 }, () => 0)
  for (const e of events) {
    dayOfWeekPattern[new Date(e.occurred_at).getDay()]++
  }

  return NextResponse.json({
    period_days: days,
    summary: {
      total_incidents: totalIncidents,
      resolved_count: resolved,
      pending_count: totalIncidents - resolved,
      total_liters_lost: totalLiters,
      total_cost_iqd: totalCostIqd,
      avg_liters_per_incident: totalIncidents > 0 ? totalLiters / totalIncidents : 0,
    },
    hourly_pattern: hourlyPattern,
    day_of_week_pattern: dayOfWeekPattern,
    by_generator: Object.entries(byGenerator)
      .map(([id, data]) => ({ generator_id: id, ...data }))
      .sort((a, b) => b.cost - a.cost),
    recent_events: events.slice(0, 30),
  })
}
