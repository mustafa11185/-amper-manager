export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

// Powers all the new widgets on the staff dashboard in one round-trip:
//   • today's collection (cash/card/wallet split, total today vs yesterday)
//   • today's goal progress (% paid vs branch unpaid count)
//   • my kabinas (with unpaid counts so the collector knows where to go)
//   • leaderboard position among collectors this month
//   • smart next subscriber to visit (highest debt, oldest unpaid)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role === 'owner') {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 })
  }
  const staffId = user.id as string
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined
  if (!branchId) return NextResponse.json({ error: 'No branch assigned' }, { status: 400 })

  // Baghdad day window (UTC+3, no DST)
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET_MS)
  const todayStart = new Date(
    Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) - IRAQ_OFFSET_MS,
  )
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  // Current cycle — replaces the old calendar monthStart.
  const cycle = await getCurrentCycleWindow(branchId)
  const cycleStart = cycle.start

  // ─── 1. Today's collection (split by payment method) ───────
  // Source of truth is Invoice.collector_id / amount_paid, not PosTransaction
  // (the POS table is legacy and not populated by the staff_flutter payment flow).
  let collection: any = { total_today: 0, total_yesterday: 0, by_method: {}, count_today: 0 }
  try {
    const [todayInvs, yesterdayAgg] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          collector_id: staffId,
          amount_paid: { gt: 0 },
          updated_at: { gte: todayStart, lt: tomorrowStart },
        },
        select: { amount_paid: true, payment_method: true },
      }),
      prisma.invoice.aggregate({
        _sum: { amount_paid: true },
        where: {
          collector_id: staffId,
          amount_paid: { gt: 0 },
          updated_at: { gte: yesterdayStart, lt: todayStart },
        },
      }),
    ])

    const byMethod: Record<string, number> = {}
    for (const inv of todayInvs) {
      const m = (inv.payment_method || 'cash').toLowerCase()
      byMethod[m] = (byMethod[m] || 0) + Number(inv.amount_paid)
    }
    collection = {
      total_today: todayInvs.reduce((s, i) => s + Number(i.amount_paid), 0),
      total_yesterday: Number(yesterdayAgg._sum.amount_paid ?? 0),
      by_method: byMethod,
      count_today: todayInvs.length,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/collection]', err.message)
  }

  // ─── 2. Today's goal — progress vs branch unpaid for the cycle ──
  // Goal = unpaid subscribers in this branch for the active billing cycle.
  // Progress = how many of them have been paid today (by anyone in branch).
  let goal: any = { target: 0, done_today: 0, progress_pct: 0 }
  try {
    const [unpaidCount, paidTodayCount] = await Promise.all([
      prisma.invoice.count({
        where: {
          branch_id: branchId,
          billing_month: cycle.month,
          billing_year: cycle.year,
          is_fully_paid: false,
        },
      }),
      prisma.invoice.count({
        where: {
          branch_id: branchId,
          amount_paid: { gt: 0 },
          updated_at: { gte: todayStart, lt: tomorrowStart },
        },
      }),
    ])

    const target = unpaidCount + paidTodayCount  // approximation: cycle workload
    goal = {
      target,
      done_today: paidTodayCount,
      progress_pct: target > 0 ? Math.round((paidTodayCount / target) * 100) : 0,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/goal]', err.message)
  }

  // ─── 3. My kabinas (alleys in branch + unpaid counts) ──────
  let kabinas: any[] = []
  try {
    const paid = await prisma.invoice.findMany({
      where: { branch_id: branchId, billing_month: cycle.month, billing_year: cycle.year, is_fully_paid: true },
      select: { subscriber_id: true },
      distinct: ['subscriber_id'],
    })
    const paidIds = new Set(paid.map(p => p.subscriber_id))

    const records = await prisma.alley.findMany({
      where: { branch_id: branchId, is_active: true },
      orderBy: { sort_order: 'asc' },
      include: {
        subscribers: { where: { is_active: true }, select: { id: true } },
      },
    })
    kabinas = records.map(a => {
      const total = a.subscribers.length
      const unpaid = a.subscribers.filter(s => !paidIds.has(s.id)).length
      return { id: a.id, name: a.name, total, unpaid }
    }).sort((a, b) => b.unpaid - a.unpaid)
  } catch (err: any) {
    console.warn('[staff-widgets/kabinas]', err.message)
  }

  // ─── 4. Leaderboard rank this month ────────────────────────
  let leaderboard: any = { rank: 0, total_collectors: 0, my_collected: 0 }
  try {
    const grouped = await prisma.invoice.groupBy({
      by: ['collector_id'],
      _sum: { amount_paid: true },
      where: {
        tenant_id: tenantId,
        amount_paid: { gt: 0 },
        collector_id: { not: null },
        updated_at: { gte: cycleStart },
      },
    })
    const ranked = grouped
      .map(g => ({ staff_id: g.collector_id!, total: Number(g._sum.amount_paid ?? 0) }))
      .sort((a, b) => b.total - a.total)
    const myIdx = ranked.findIndex(r => r.staff_id === staffId)
    leaderboard = {
      rank: myIdx >= 0 ? myIdx + 1 : 0,
      total_collectors: ranked.length,
      my_collected: myIdx >= 0 ? ranked[myIdx].total : 0,
      top_collected: ranked[0]?.total ?? 0,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/leaderboard]', err.message)
  }

  // ─── 5. Smart next subscriber suggestion ───────────────────
  // Highest debt + oldest unpaid invoice in this branch — the row most
  // likely to slip through the cracks if not visited soon.
  let nextSubscriber: any = null
  try {
    const candidates = await prisma.subscriber.findMany({
      where: {
        branch_id: branchId,
        is_active: true,
        total_debt: { gt: 0 },
      },
      orderBy: [{ total_debt: 'desc' }],
      take: 1,
      select: {
        id: true,
        name: true,
        serial_number: true,
        phone: true,
        total_debt: true,
        amperage: true,
        alley: true,
        alley_ref: { select: { name: true } },
      },
    })
    if (candidates.length > 0) {
      const c = candidates[0]
      nextSubscriber = {
        id: c.id,
        name: c.name,
        serial_number: c.serial_number,
        phone: c.phone,
        total_debt: Number(c.total_debt),
        amperage: Number(c.amperage),
        alley: (c as any).alley_ref?.name ?? c.alley ?? null,
      }
    }
  } catch (err: any) {
    console.warn('[staff-widgets/next]', err.message)
  }

  // ─── Engines + oil status (per-engine, days-based) ───────
  // Same shape the manager dashboard widgets API returns so the
  // shared OilStatusCard widget can render against either source.
  let engines: any[] = []
  try {
    const list = await prisma.engine.findMany({
      where: { generator: { branch_id: branchId } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        model: true,
        runtime_hours: true,
        last_oil_change_at: true,
        oil_summer_days: true,
        oil_winter_days: true,
        oil_normal_days: true,
        generator: { select: { id: true, name: true, run_status: true } },
      },
    })
    const month = new Date().getMonth() + 1
    const isSummer = month >= 6 && month <= 9
    const isWinter = month === 12 || month <= 2
    engines = list.map((e: any) => {
      const seasonalDays = isSummer
        ? (e.oil_summer_days ?? 15)
        : isWinter
          ? (e.oil_winter_days ?? 25)
          : (e.oil_normal_days ?? 20)
      const lastOilAt = e.last_oil_change_at as Date | null
      let oilDaysSince: number | null = null
      let oilDaysRemaining: number | null = null
      if (lastOilAt) {
        const ms = Date.now() - lastOilAt.getTime()
        oilDaysSince = Math.floor(ms / (1000 * 60 * 60 * 24))
        oilDaysRemaining = seasonalDays - oilDaysSince
      }
      return {
        id: e.id,
        name: e.name,
        model: e.model,
        generator_id: e.generator.id,
        generator_name: e.generator.name,
        is_running: e.generator.run_status,
        runtime_hours: Number(e.runtime_hours),
        last_oil_change_at: lastOilAt?.toISOString() ?? null,
        oil_interval_days: seasonalDays,
        oil_days_since: oilDaysSince,
        oil_days_remaining: oilDaysRemaining,
      }
    })
  } catch (err: any) {
    console.warn('[staff-widgets/engines]', err.message)
  }

  // Fuel tanks for this branch
  let fuelTanks: any[] = []
  try {
    fuelTanks = await prisma.fuelTank.findMany({
      where: { generator: { branch_id: branchId }, is_active: true },
      orderBy: [{ generator_id: 'asc' }, { sensor_index: 'asc' }],
      select: {
        id: true, name: true, tank_type: true, current_pct: true,
        capacity_liters: true, last_updated: true,
        generator: { select: { name: true } },
      },
    })
  } catch (err: any) {
    console.warn('[staff-widgets/fuel]', err.message)
  }

  return NextResponse.json({
    collection,
    goal,
    kabinas,
    leaderboard,
    next_subscriber: nextSubscriber,
    engines,
    fuel_tanks: fuelTanks,
  })
}
