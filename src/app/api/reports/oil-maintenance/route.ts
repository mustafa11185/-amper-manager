// GET /api/reports/oil-maintenance
//
// Owner-only oil-change history report. Aggregates the
// MaintenanceLog rows of type 'oil_change' for the current tenant
// and returns:
//   • month_summary  → counts + total cost for THIS month
//   • year_summary   → counts + total cost for THIS year
//   • per_engine     → for each engine: change count, total cost,
//                      avg interval (days), last change, current
//                      status (days_since, days_remaining)
//   • recent_changes → last 30 oil_change rows with meta
//   • alerts         → engines currently overdue or due soon
//
// Query params (optional):
//   ?month=2026-04   → restrict month_summary to a specific month

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const tenantId = user.tenantId
    const url = new URL(req.url)
    const monthParam = url.searchParams.get('month') // YYYY-MM
    const now = new Date()
    let monthStart: Date
    let monthEnd: Date
    if (monthParam) {
      const [y, m] = monthParam.split('-').map(Number)
      monthStart = new Date(y, m - 1, 1)
      monthEnd = new Date(y, m, 0, 23, 59, 59)
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    }
    const yearStart = new Date(now.getFullYear(), 0, 1)

    // ── Month summary ──
    const monthLogs = await prisma.maintenanceLog.findMany({
      where: {
        tenant_id: tenantId,
        type: 'oil_change',
        performed_at: { gte: monthStart, lte: monthEnd },
      },
    })
    const monthSummary = {
      count: monthLogs.length,
      total_cost_iqd: monthLogs.reduce((s, l) => s + Number(l.cost ?? 0), 0),
    }

    // ── Year summary ──
    const yearLogs = await prisma.maintenanceLog.findMany({
      where: {
        tenant_id: tenantId,
        type: 'oil_change',
        performed_at: { gte: yearStart },
      },
    })
    const yearSummary = {
      count: yearLogs.length,
      total_cost_iqd: yearLogs.reduce((s, l) => s + Number(l.cost ?? 0), 0),
    }

    // ── Per-engine ──
    const engines = await prisma.engine.findMany({
      where: { generator: { branch: { tenant_id: tenantId } } },
      include: { generator: { select: { name: true } } },
    })
    const month = now.getMonth() + 1
    const isSummer = month >= 6 && month <= 9
    const isWinter = month === 12 || month <= 2
    const perEngine = await Promise.all(engines.map(async (eng) => {
      const e: any = eng
      const logs = await prisma.maintenanceLog.findMany({
        where: { tenant_id: tenantId, engine_id: e.id, type: 'oil_change' },
        orderBy: { performed_at: 'desc' },
        take: 50,
      })
      const totalCost = logs.reduce((s, l) => s + Number(l.cost ?? 0), 0)

      // Average interval in days between consecutive changes
      let avgIntervalDays: number | null = null
      if (logs.length >= 2) {
        const intervals: number[] = []
        for (let i = 0; i < logs.length - 1; i++) {
          const d1 = logs[i].performed_at.getTime()
          const d2 = logs[i + 1].performed_at.getTime()
          intervals.push((d1 - d2) / (1000 * 60 * 60 * 24))
        }
        avgIntervalDays = intervals.reduce((a, b) => a + b, 0) / intervals.length
      }

      const expectedInterval = isSummer
        ? (e.oil_summer_days ?? 15)
        : isWinter
          ? (e.oil_winter_days ?? 25)
          : (e.oil_normal_days ?? 20)

      let daysSince: number | null = null
      let daysRemaining: number | null = null
      if (e.last_oil_change_at) {
        daysSince = Math.floor((Date.now() - new Date(e.last_oil_change_at).getTime()) / (1000 * 60 * 60 * 24))
        daysRemaining = expectedInterval - daysSince
      }

      return {
        id: e.id,
        name: e.name,
        generator_name: e.generator.name,
        change_count_total: logs.length,
        total_cost_iqd: totalCost,
        avg_interval_days: avgIntervalDays != null ? Math.round(avgIntervalDays) : null,
        expected_interval_days: expectedInterval,
        last_change_at: e.last_oil_change_at?.toISOString() ?? null,
        days_since: daysSince,
        days_remaining: daysRemaining,
        is_overdue: daysRemaining != null && daysRemaining < 0,
        is_due_soon: daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 3,
      }
    }))

    // ── Recent changes ──
    const recentChanges = await prisma.maintenanceLog.findMany({
      where: { tenant_id: tenantId, type: 'oil_change' },
      orderBy: { performed_at: 'desc' },
      take: 30,
      include: { engine: { select: { name: true, generator: { select: { name: true } } } } },
    })

    // ── Active alerts ──
    const alerts = perEngine.filter((p) => p.is_overdue || p.is_due_soon)

    return NextResponse.json({
      month: { start: monthStart.toISOString(), end: monthEnd.toISOString(), ...monthSummary },
      year: { start: yearStart.toISOString(), ...yearSummary },
      per_engine: perEngine,
      recent_changes: recentChanges.map((l) => ({
        id: l.id,
        engine_id: l.engine_id,
        engine_name: l.engine.name,
        generator_name: l.engine.generator.name,
        performed_at: l.performed_at.toISOString(),
        performed_by: l.performed_by,
        hours_at_service: Number(l.hours_at_service),
        cost: l.cost != null ? Number(l.cost) : null,
        description: l.description,
      })),
      alerts,
      season: isSummer ? 'summer' : (isWinter ? 'winter' : 'normal'),
    })
  } catch (err: any) {
    console.error('[reports/oil-maintenance]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
