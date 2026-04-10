import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Detailed profitability — last 6 months per generator with full breakdown
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const branches = await prisma.branch.findMany({
    where: user.role === 'owner' ? { tenant_id: tenantId } : { id: branchId },
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const generators = await prisma.generator.findMany({
    where: { branch_id: { in: branchIds }, is_active: true },
    include: { branch: { select: { name: true } } },
  })

  const now = new Date()
  // 6 months window
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { month: d.getMonth() + 1, year: d.getFullYear() }
  })

  const result = await Promise.all(generators.map(async (gen) => {
    const monthlyData = await Promise.all(months.map(async ({ month, year }) => {
      const periodStart = new Date(year, month - 1, 1)
      const periodEnd = new Date(year, month, 0, 23, 59, 59)

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
