import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

// Voltage stability report — patterns + critical events + per-generator stats
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const branchIds = await resolveBranchIds(req, user)
  const where: any = { tenant_id: tenantId, branch_id: { in: branchIds } }

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prisma.voltageEvent.findMany({
    where: { ...where, detected_at: { gte: since } },
    orderBy: { detected_at: 'desc' },
  })

  // Group by type
  const byType = {
    low_warning: 0, low_critical: 0, high_warning: 0, high_critical: 0,
  }
  for (const e of events) {
    byType[e.type as keyof typeof byType] = (byType[e.type as keyof typeof byType] || 0) + 1
  }

  // Hourly pattern (when does instability happen most?)
  const hourly = Array.from({ length: 24 }, () => 0)
  for (const e of events) {
    const h = (new Date(e.detected_at).getUTCHours() + 3) % 24
    hourly[h]++
  }

  // Per generator
  const byGen: Record<string, { count: number; critical: number; min: number; max: number; name?: string }> = {}
  for (const e of events) {
    if (!byGen[e.generator_id]) {
      byGen[e.generator_id] = { count: 0, critical: 0, min: Infinity, max: 0 }
    }
    byGen[e.generator_id].count++
    if (e.type.endsWith('_critical')) byGen[e.generator_id].critical++
    byGen[e.generator_id].min = Math.min(byGen[e.generator_id].min, e.voltage)
    byGen[e.generator_id].max = Math.max(byGen[e.generator_id].max, e.voltage)
  }

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

  // Recent average voltage per branch (from telemetry) — reuse the
  // same branchIds we already resolved at the top of the handler.
  const recentAvg = await prisma.iotTelemetry.aggregate({
    _avg: { voltage_v: true },
    where: {
      device: { branch_id: { in: branchIds } },
      voltage_v: { gt: 50 },
      recorded_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  })

  return NextResponse.json({
    period_days: days,
    summary: {
      total_events: events.length,
      critical_events: byType.low_critical + byType.high_critical,
      affected_generators: Object.keys(byGen).length,
      avg_voltage_24h: Math.round(Number(recentAvg._avg.voltage_v ?? 0)),
    },
    by_type: byType,
    hourly_pattern: hourly,
    by_generator: Object.entries(byGen)
      .map(([id, data]) => ({
        generator_id: id, ...data,
        min: data.min === Infinity ? 0 : data.min,
      }))
      .sort((a, b) => b.critical - a.critical),
    recent_events: events.slice(0, 50),
  })
}
