import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

// Detailed profitability — last 6 cycles per generator with full breakdown
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  const branchIds = await resolveBranchIds(req, user)
  if (branchIds.length === 0) {
    return NextResponse.json({ period: { months: 6 }, tenant_totals: {}, generators: [] })
  }

  const generators = await prisma.generator.findMany({
    where: { branch_id: { in: branchIds }, is_active: true },
    include: { branch: { select: { name: true } } },
  })

  const now = new Date()
  // Build the 6 historical windows based on generation logs of the
  // FIRST branch. The most recent slot is the current open cycle
  // (from last generation → now); the 5 prior slots come from the
  // windows between consecutive prior logs. Falls back to calendar
  // months when the log history is thin.
  type Slot = { month: number; year: number; start: Date; end: Date }
  const slots: Slot[] = []
  const currentCycle = await getCurrentCycleWindow(branchIds[0])
  const logs = await prisma.invoiceGenerationLog.findMany({
    where: { branch_id: branchIds[0], is_reversed: false },
    orderBy: { generated_at: 'desc' },
    take: 7,
    select: { generated_at: true, billing_month: true, billing_year: true },
  }).catch(() => [] as Array<{ generated_at: Date; billing_month: number; billing_year: number }>)

  if (logs.length >= 2) {
    // Most recent open slot
    slots.push({
      month: currentCycle.month,
      year: currentCycle.year,
      start: currentCycle.start,
      end: now,
    })
    // Prior closed slots
    for (let i = 1; i < Math.min(logs.length, 6); i++) {
      const start = logs[i].generated_at
      const end = logs[i - 1].generated_at
      slots.push({
        month: logs[i].billing_month,
        year: logs[i].billing_year,
        start,
        end,
      })
    }
    // Pad with calendar months if we have fewer than 6 logs
    while (slots.length < 6) {
      const offset = slots.length
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const endD = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1)
      slots.push({ month: d.getMonth() + 1, year: d.getFullYear(), start: d, end: endD })
    }
    slots.reverse() // oldest → newest for the chart
  } else {
    // Fallback: 6 calendar months
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const endD = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1)
      slots.push({ month: d.getMonth() + 1, year: d.getFullYear(), start: d, end: endD })
    }
  }

  const result = await Promise.all(generators.map(async (gen) => {
    const monthlyData = await Promise.all(slots.map(async ({ month, year, start: periodStart, end: periodEnd }) => {
      const subs = await prisma.subscriber.findMany({
        where: { generator_id: gen.id },
        select: { id: true },
      })
      const subIds = subs.map(s => s.id)

      const [revenueAgg, fuelAgg] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: { subscriber_id: { in: subIds }, billing_month: month, billing_year: year },
        }),
        prisma.fuelConsumption.aggregate({
          _sum: { cost_iqd: true, liters_consumed: true, runtime_minutes: true },
          where: { generator_id: gen.id, window_end: { gte: periodStart, lte: periodEnd } },
        }),
      ])

      const revenue = Number(revenueAgg._sum.amount_paid ?? 0)
      const fuelCost = Number(fuelAgg._sum.cost_iqd ?? 0)
      const liters = Number(fuelAgg._sum.liters_consumed ?? 0)
      const minutes = Number(fuelAgg._sum.runtime_minutes ?? 0)

      return {
        month, year,
        revenue,
        fuel_cost: fuelCost,
        liters,
        runtime_hours: minutes / 60,
        net_profit: revenue - fuelCost,
      }
    }))

    const total = monthlyData.reduce((acc, m) => ({
      revenue: acc.revenue + m.revenue,
      fuel: acc.fuel + m.fuel_cost,
      liters: acc.liters + m.liters,
      hours: acc.hours + m.runtime_hours,
      profit: acc.profit + m.net_profit,
    }), { revenue: 0, fuel: 0, liters: 0, hours: 0, profit: 0 })

    return {
      id: gen.id,
      name: gen.name,
      branch_name: gen.branch.name,
      monthly: monthlyData,
      totals_6m: total,
      avg_lph: total.hours > 0 ? total.liters / total.hours : 0,
      profit_margin: total.revenue > 0 ? (total.profit / total.revenue) * 100 : 0,
    }
  }))

  // Tenant-wide totals
  const tenantTotal = result.reduce((acc, g) => ({
    revenue: acc.revenue + g.totals_6m.revenue,
    fuel: acc.fuel + g.totals_6m.fuel,
    profit: acc.profit + g.totals_6m.profit,
    liters: acc.liters + g.totals_6m.liters,
  }), { revenue: 0, fuel: 0, profit: 0, liters: 0 })

  return NextResponse.json({
    period: { months: 6 },
    tenant_totals: tenantTotal,
    generators: result.sort((a, b) => b.totals_6m.profit - a.totals_6m.profit),
  })
}
