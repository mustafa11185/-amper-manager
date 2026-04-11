// GET /api/reports/fuel-consumption?month=YYYY-MM
//
// Owner / accountant only. Aggregates FuelLog rows for the tenant
// and returns:
//   • month_summary  → refills count, refilled liters, refill cost,
//                      manual deductions, IoT readings, theft alerts
//   • year_summary
//   • per_generator  → for each generator: refills, total liters,
//                      total cost, current fuel level
//   • recent_events  → last 30 events (refill / deduct / theft)
//   • theft_alerts   → recent theft_alert events as a separate list

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
    const monthParam = url.searchParams.get('month')
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

    // All generators for this tenant — used to scope fuel logs.
    const generators = await prisma.generator.findMany({
      where: { branch: { tenant_id: tenantId } },
      include: { branch: { select: { name: true } } },
    })
    const genIds = generators.map((g) => g.id)
    // Backward-compat: collect engine IDs so we can also catch
    // pre-upgrade FuelLog rows that only had engine_id set.
    const engineIds = await prisma.engine.findMany({
      where: { generator_id: { in: genIds } },
      select: { id: true },
    }).then((rows) => rows.map((r) => r.id))
    // Single helper used by every fuelLog query below — matches
    // either the new generator_id column or the legacy engine link.
    const fuelScope = (extra: any = {}) => ({
      OR: [
        { generator_id: { in: genIds }, ...extra },
        ...(engineIds.length > 0 ? [{ engine_id: { in: engineIds }, ...extra }] : []),
      ],
    })
    if (genIds.length === 0) {
      return NextResponse.json({
        month: { start: monthStart.toISOString(), end: monthEnd.toISOString(), refills: 0, liters_refilled: 0, total_cost_iqd: 0, deductions: 0, liters_deducted: 0 },
        year: { start: yearStart.toISOString(), refills: 0, liters_refilled: 0, total_cost_iqd: 0 },
        per_generator: [],
        recent_events: [],
        theft_alerts: [],
      })
    }

    // ── Month summary ──
    const monthLogs = await prisma.fuelLog.findMany({
      where: fuelScope({ logged_at: { gte: monthStart, lte: monthEnd } }),
    })
    const monthSummary = {
      refills: monthLogs.filter((l) => l.event_type === 'refill').length,
      liters_refilled: monthLogs.filter((l) => l.event_type === 'refill').reduce((s, l) => s + (l.fuel_added_liters ?? 0), 0),
      total_cost_iqd: monthLogs.reduce((s, l) => s + Number(l.cost_iqd ?? 0), 0),
      deductions: monthLogs.filter((l) => l.event_type === 'manual_deduction').length,
      liters_deducted: Math.abs(monthLogs.filter((l) => l.event_type === 'manual_deduction').reduce((s, l) => s + (l.fuel_added_liters ?? 0), 0)),
      iot_readings: monthLogs.filter((l) => l.event_type === 'iot_reading').length,
      theft_alerts: monthLogs.filter((l) => l.event_type === 'theft_alert').length,
    }

    // ── Year summary ──
    const yearLogs = await prisma.fuelLog.findMany({
      where: fuelScope({ logged_at: { gte: yearStart } }),
      select: { event_type: true, fuel_added_liters: true, cost_iqd: true },
    })
    const yearSummary = {
      refills: yearLogs.filter((l) => l.event_type === 'refill').length,
      liters_refilled: yearLogs.filter((l) => l.event_type === 'refill').reduce((s, l) => s + (l.fuel_added_liters ?? 0), 0),
      total_cost_iqd: yearLogs.reduce((s, l) => s + Number(l.cost_iqd ?? 0), 0),
    }

    // ── Per-generator ──
    const perGenerator = await Promise.all(generators.map(async (g) => {
      // Per-generator we still need to scope by THIS generator's id +
      // its engine ids (the helper above is global to the tenant).
      const myEngineIds = await prisma.engine.findMany({
        where: { generator_id: g.id },
        select: { id: true },
      }).then((rows) => rows.map((r) => r.id))
      const logs = await prisma.fuelLog.findMany({
        where: {
          OR: [
            { generator_id: g.id, logged_at: { gte: yearStart } },
            ...(myEngineIds.length > 0 ? [{ engine_id: { in: myEngineIds }, logged_at: { gte: yearStart } }] : []),
          ],
        },
      })
      const refills = logs.filter((l) => l.event_type === 'refill')
      const tankCap = g.tank_capacity_liters ?? 0
      const pct = g.fuel_level_pct ?? 0
      return {
        id: g.id,
        name: g.name,
        branch_name: g.branch.name,
        tank_capacity_liters: tankCap,
        current_pct: pct,
        current_liters: tankCap > 0 ? pct * tankCap / 100 : 0,
        refills_year: refills.length,
        liters_refilled_year: refills.reduce((s, l) => s + (l.fuel_added_liters ?? 0), 0),
        total_cost_year: refills.reduce((s, l) => s + Number(l.cost_iqd ?? 0), 0),
        last_refill_at: refills[0]?.logged_at?.toISOString() ?? null,
      }
    }))

    // ── Recent events (refills + deductions + theft) ──
    const recentEvents = await prisma.fuelLog.findMany({
      where: fuelScope({ event_type: { in: ['refill', 'manual_deduction', 'theft_alert'] } }),
      orderBy: { logged_at: 'desc' },
      take: 30,
    })

    // ── Theft alerts ──
    const theftAlerts = await prisma.fuelLog.findMany({
      where: fuelScope({ event_type: 'theft_alert', logged_at: { gte: monthStart } }),
      orderBy: { logged_at: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      month: { start: monthStart.toISOString(), end: monthEnd.toISOString(), ...monthSummary },
      year: { start: yearStart.toISOString(), ...yearSummary },
      per_generator: perGenerator,
      recent_events: recentEvents.map((l) => ({
        id: l.id,
        generator_id: l.generator_id,
        event_type: l.event_type,
        source: l.source,
        liters_change: l.fuel_added_liters,
        cost_iqd: l.cost_iqd != null ? Number(l.cost_iqd) : null,
        notes: l.notes,
        logged_at: l.logged_at.toISOString(),
      })),
      theft_alerts: theftAlerts.map((l) => ({
        id: l.id,
        generator_id: l.generator_id,
        liters_lost: l.fuel_added_liters,
        notes: l.notes,
        logged_at: l.logged_at.toISOString(),
      })),
    })
  } catch (err: any) {
    console.error('[reports/fuel-consumption]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
