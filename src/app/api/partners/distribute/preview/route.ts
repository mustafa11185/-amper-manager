import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/partners/distribute/preview?month=&year=&scope_type=tenant&scope_id=...
// Calculates the profit distribution WITHOUT saving anything.
// Used by the UI to show the user what will happen before they confirm.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const sp = req.nextUrl.searchParams
  const now = new Date()
  const month = parseInt(sp.get('month') ?? String(now.getMonth() + 1))
  const year = parseInt(sp.get('year') ?? String(now.getFullYear()))
  const scopeType = sp.get('scope_type') ?? 'tenant'
  const scopeId = sp.get('scope_id') ?? null

  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)

  // ── 1. Get all active partners + their relevant shares ──
  const partners = await prisma.partner.findMany({
    where: { tenant_id: tenantId, is_active: true },
    include: {
      shares: {
        where: {
          OR: [
            { effective_to: null },
            { effective_to: { gte: periodStart } },
          ],
          effective_from: { lte: periodEnd },
        },
      },
    },
  })

  // Filter shares matching scope
  const partnerShares = partners.map(p => {
    const matchingShare = p.shares.find(s =>
      s.scope_type === scopeType && (s.scope_id ?? null) === scopeId
    )
    return {
      partner: { id: p.id, name: p.name, phone: p.phone },
      percentage: matchingShare ? Number(matchingShare.percentage) : 0,
    }
  }).filter(ps => ps.percentage > 0)

  const totalPct = partnerShares.reduce((s, ps) => s + ps.percentage, 0)

  // ── 2. Compute profit for the period (scope-aware) ──
  // Branch / generator scope filter
  let branchIds: string[] = []
  if (scopeType === 'branch' && scopeId) {
    branchIds = [scopeId]
  } else if (scopeType === 'generator' && scopeId) {
    const gen = await prisma.generator.findUnique({ where: { id: scopeId } })
    if (gen) branchIds = [gen.branch_id]
  } else {
    const branches = await prisma.branch.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    })
    branchIds = branches.map(b => b.id)
  }

  // Revenue (paid invoices for the period)
  const revenueAgg = await prisma.invoice.aggregate({
    _sum: { amount_paid: true },
    where: {
      branch_id: { in: branchIds },
      billing_month: month,
      billing_year: year,
    },
  })
  const revenue = Number(revenueAgg._sum.amount_paid ?? 0)

  // Fuel cost (from FuelConsumption snapshots)
  const fuelWhere: any = {
    tenant_id: tenantId,
    window_end: { gte: periodStart, lte: periodEnd },
  }
  if (scopeType === 'branch' && scopeId) fuelWhere.branch_id = scopeId
  if (scopeType === 'generator' && scopeId) fuelWhere.generator_id = scopeId

  const fuelAgg = await prisma.fuelConsumption.aggregate({
    _sum: { cost_iqd: true, liters_consumed: true },
    where: fuelWhere,
  })
  const fuelCost = Number(fuelAgg._sum.cost_iqd ?? 0)

  // Other expenses (manual, branch-level)
  const expensesAgg = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: {
      branch_id: { in: branchIds },
      created_at: { gte: periodStart, lte: periodEnd },
    },
  })
  const expenses = Number(expensesAgg._sum.amount ?? 0)

  const totalCosts = fuelCost + expenses
  const netProfit = revenue - totalCosts

  // ── 3. Build distribution lines ──
  const lines = partnerShares.map(ps => ({
    partner_id: ps.partner.id,
    partner_name: ps.partner.name,
    partner_phone: ps.partner.phone,
    percentage: ps.percentage,
    amount: Math.round((netProfit * ps.percentage) / 100),
  }))

  return NextResponse.json({
    period: { month, year },
    scope: { type: scopeType, id: scopeId },
    revenue,
    fuel_cost: fuelCost,
    other_expenses: expenses,
    total_costs: totalCosts,
    net_profit: netProfit,
    total_share_pct: totalPct,
    unallocated_pct: Math.max(0, 100 - totalPct),
    lines,
  })
}
