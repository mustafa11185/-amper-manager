import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Returns per-generator profitability for the requested month (default: current):
//   revenue (from invoices) - fuel cost (from FuelConsumption) - expenses - fuel theft losses
// Accepts ?month=&year= for AI report use case.
export async function GET(req: NextRequest) {
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

  // Allow query params for a specific period (used by AI report)
  const sp = req.nextUrl.searchParams
  const now = new Date()
  const currentMonth = parseInt(sp.get('month') ?? String(now.getMonth() + 1))
  const currentYear = parseInt(sp.get('year') ?? String(now.getFullYear()))
  const monthStart = new Date(currentYear, currentMonth - 1, 1)
  const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59)

  const generators = await prisma.generator.findMany({
    where: { branch_id: { in: branchIds }, is_active: true },
    select: {
      id: true, name: true, branch_id: true,
      branch: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })

  const result = await Promise.all(generators.map(async (gen) => {
    // Revenue: sum of invoices for subscribers on this generator this month
    const subs = await prisma.subscriber.findMany({
      where: { generator_id: gen.id },
      select: { id: true },
    })
    const subIds = subs.map(s => s.id)

    const revenueAgg = await prisma.invoice.aggregate({
      _sum: { amount_paid: true },
      where: {
        subscriber_id: { in: subIds },
        billing_month: currentMonth,
        billing_year: currentYear,
      },
    })
    const revenue = Number(revenueAgg._sum.amount_paid ?? 0)

    // Fuel cost (this month, from FuelConsumption snapshots)
    const fuelAgg = await prisma.fuelConsumption.aggregate({
      _sum: { liters_consumed: true, cost_iqd: true, runtime_minutes: true },
      _avg: { liters_per_hour: true, avg_current_a: true },
      where: { generator_id: gen.id, window_end: { gte: monthStart, lte: monthEnd } },
    })
    const fuelCost = Number(fuelAgg._sum.cost_iqd ?? 0)
    const litersConsumed = Number(fuelAgg._sum.liters_consumed ?? 0)
    const runtimeMinutes = Number(fuelAgg._sum.runtime_minutes ?? 0)
    const avgLph = Number(fuelAgg._avg.liters_per_hour ?? 0)
    const avgCurrent = Number(fuelAgg._avg.avg_current_a ?? 0)

    // Fuel theft losses (subtract from profit)
    const theftAgg = await prisma.fuelEvent.aggregate({
      _sum: { cost_est_iqd: true },
      _count: true,
      where: {
        generator_id: gen.id,
        type: 'theft_suspected',
        occurred_at: { gte: monthStart, lte: monthEnd },
      },
    })
    const theftLoss = Number(theftAgg._sum.cost_est_iqd ?? 0)
    const theftCount = theftAgg._count

    // Expenses (manual entries this month for this branch — best approximation)
    const expensesAgg = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: { branch_id: gen.branch_id, created_at: { gte: monthStart, lte: monthEnd } },
    })
    // Allocate expenses across all generators in this branch (rough)
    const branchGens = generators.filter(g => g.branch_id === gen.branch_id).length || 1
    const allocatedExpenses = Number(expensesAgg._sum.amount ?? 0) / branchGens

    const totalCost = fuelCost + allocatedExpenses + theftLoss
    const profit = revenue - totalCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0

    return {
      id: gen.id,
      name: gen.name,
      branch_name: gen.branch.name,
      revenue,
      fuel_cost: fuelCost,
      other_expenses: allocatedExpenses,
      theft_loss: theftLoss,
      theft_count: theftCount,
      total_cost: totalCost,
      profit,
      margin_pct: margin,
      // Operational
      liters_consumed: litersConsumed,
      runtime_hours: runtimeMinutes / 60,
      avg_liters_per_hour: avgLph,
      avg_current_a: avgCurrent,
      cost_per_kwh: avgCurrent > 0 && runtimeMinutes > 0
        ? fuelCost / (avgCurrent * 0.22 * (runtimeMinutes / 60))  // rough kWh estimate
        : 0,
    }
  }))

  // Tenant total
  const totals = result.reduce((acc, g) => ({
    revenue: acc.revenue + g.revenue,
    fuel_cost: acc.fuel_cost + g.fuel_cost,
    other_expenses: acc.other_expenses + g.other_expenses,
    theft_loss: acc.theft_loss + g.theft_loss,
    profit: acc.profit + g.profit,
  }), { revenue: 0, fuel_cost: 0, other_expenses: 0, theft_loss: 0, profit: 0 })

  return NextResponse.json({
    generators: result,
    totals,
    period: { month: currentMonth, year: currentYear },
  })
}
