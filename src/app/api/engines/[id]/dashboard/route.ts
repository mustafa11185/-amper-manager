// GET /api/engines/[id]/dashboard
//
// Returns everything the Flutter engine detail screen needs in one call:
//   - Engine config (runtime, oil/filter/service intervals)
//   - Latest sensor readings (temperature, oil pressure, load)
//   - Maintenance status (hours since each service, percent elapsed)
//   - Parent generator run_status + name
// Tenant-scoped via the generator → branch chain.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as { tenantId?: string }
  const { id } = await params

  const engine = await prisma.engine.findUnique({
    where: { id },
    include: {
      generator: {
        include: { branch: { select: { tenant_id: true, name: true } } },
      },
      maintenance_logs: {
        orderBy: { performed_at: 'desc' },
        take: 10,
      },
    },
  })
  if (!engine) {
    return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
  }
  if (engine.generator.branch.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Latest sensor readings — each is a separate query since they live in
  // different tables without a direct Engine relation.
  const [latestTemp, latestPressure, latestLoad] = await Promise.all([
    prisma.temperatureLog.findFirst({
      where: { engine_id: id },
      orderBy: { logged_at: 'desc' },
    }),
    prisma.oilPressureLog.findFirst({
      where: { engine_id: id },
      orderBy: { logged_at: 'desc' },
    }),
    prisma.loadLog.findFirst({
      where: { engine_id: id },
      orderBy: { logged_at: 'desc' },
    }),
  ])

  const runtime = Number(engine.runtime_hours ?? 0)
  const hoursAtOil = Number(engine.hours_at_last_oil ?? 0)
  const hoursAtFilter = Number(engine.hours_at_last_filter ?? 0)
  const hoursAtService = Number(engine.hours_at_last_service ?? 0)

  const oilSince = Math.max(0, runtime - hoursAtOil)
  const filterSince = Math.max(0, runtime - hoursAtFilter)
  const serviceSince = Math.max(0, runtime - hoursAtService)

  const oilPctHours = Math.min(100, (oilSince / engine.oil_change_hours) * 100)
  const filterPct = Math.min(100, (filterSince / engine.air_filter_hours) * 100)
  const servicePct = Math.min(100, (serviceSince / engine.full_service_hours) * 100)

  // ── Days-based oil tracking ─────────────────────────────────
  // Engines also get an oil change on a fixed calendar cadence
  // (every 20 days in normal weather, 15 in summer, 25 in winter)
  // regardless of runtime hours. Same model the staff dashboard
  // uses — we compute it here so both screens agree.
  const month = new Date().getMonth() + 1
  const isSummer = month >= 6 && month <= 9
  const isWinter = month === 12 || month <= 2
  const seasonalOilDays = isSummer
    ? (engine.oil_summer_days ?? 15)
    : isWinter
      ? (engine.oil_winter_days ?? 25)
      : (engine.oil_normal_days ?? 20)
  const lastOilAt = engine.last_oil_change_at as Date | null
  let oilDaysSince: number | null = null
  let oilDaysRemaining: number | null = null
  let oilPctDays = 0
  if (lastOilAt) {
    oilDaysSince = Math.max(0, Math.floor((Date.now() - lastOilAt.getTime()) / (1000 * 60 * 60 * 24)))
    oilDaysRemaining = seasonalOilDays - oilDaysSince
    oilPctDays = Math.min(100, (oilDaysSince / seasonalOilDays) * 100)
  }

  // Winning oil model = whichever is more due (higher %). If the
  // engine barely ran but the calendar says it's time, days win.
  // If the engine ran long but the calendar says it's still early,
  // hours win. Whichever breaches first should raise the flag.
  const oilPct = Math.max(oilPctHours, oilPctDays)
  const oilUsesDays = oilPctDays >= oilPctHours && oilDaysSince != null

  // "Next action" — whichever is closest to due (highest percent).
  const nextAction = [
    {
      type: 'oil_change',
      label: 'تغيير الزيت',
      pct: oilPct,
      hours_left: engine.oil_change_hours - oilSince,
      days_left: oilDaysRemaining,
      uses_days: oilUsesDays,
    },
    { type: 'air_filter', label: 'فلتر الهواء', pct: filterPct, hours_left: engine.air_filter_hours - filterSince },
    { type: 'full_service', label: 'صيانة شاملة', pct: servicePct, hours_left: engine.full_service_hours - serviceSince },
  ].sort((a, b) => b.pct - a.pct)[0]

  return NextResponse.json({
    engine: {
      id: engine.id,
      name: engine.name,
      model: engine.model,
      runtime_hours: runtime,
      oil_change_hours: engine.oil_change_hours,
      air_filter_hours: engine.air_filter_hours,
      full_service_hours: engine.full_service_hours,
      last_oil_change_at: engine.last_oil_change_at,
    },
    generator: {
      id: engine.generator.id,
      name: engine.generator.name,
      run_status: engine.generator.run_status,
    },
    sensors: {
      temperature_celsius: latestTemp ? Number(latestTemp.temp_celsius) : null,
      temperature_at: latestTemp?.logged_at ?? null,
      oil_pressure_bar: latestPressure ? Number(latestPressure.pressure_bar) : null,
      oil_pressure_at: latestPressure?.logged_at ?? null,
      load_ampere: latestLoad ? Number(latestLoad.load_ampere) : null,
      gold_current_a: latestLoad?.gold_current_a != null ? Number(latestLoad.gold_current_a) : null,
      normal_current_a: latestLoad?.normal_current_a != null ? Number(latestLoad.normal_current_a) : null,
      load_at: latestLoad?.logged_at ?? null,
    },
    maintenance: {
      oil: {
        hours_since: oilSince,
        hours_limit: engine.oil_change_hours,
        percent: Math.round(oilPct),
        last_at: engine.last_oil_change_at,
        days_since: oilDaysSince,
        days_remaining: oilDaysRemaining,
        interval_days: seasonalOilDays,
        uses_days_model: oilUsesDays,
      },
      air_filter: {
        hours_since: filterSince,
        hours_limit: engine.air_filter_hours,
        percent: Math.round(filterPct),
      },
      full_service: {
        hours_since: serviceSince,
        hours_limit: engine.full_service_hours,
        percent: Math.round(servicePct),
      },
      next_action: nextAction,
      recent_logs: engine.maintenance_logs.map((m) => ({
        id: m.id,
        type: m.type,
        description: m.description,
        hours_at_service: Number(m.hours_at_service),
        cost: m.cost != null ? Number(m.cost) : null,
        performed_by: m.performed_by,
        performed_at: m.performed_at,
      })),
    },
  })
}
