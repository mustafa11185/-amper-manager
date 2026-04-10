import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Comprehensive partners report — all partners, balances, distributions, history
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const partners = await prisma.partner.findMany({
    where: { tenant_id: tenantId },
    include: {
      shares: { where: { effective_to: null } },
    },
    orderBy: [{ is_active: 'desc' }, { joined_at: 'asc' }],
  })

  // Compute balance + distributions per partner
  const enriched = await Promise.all(partners.map(async (p) => {
    const [contribAgg, withdrawAgg, distroAgg, withdrawalsList] = await Promise.all([
      prisma.partnerContribution.aggregate({
        _sum: { amount: true }, _count: true,
        where: { partner_id: p.id },
      }),
      prisma.partnerWithdrawal.aggregate({
        _sum: { amount: true }, _count: true,
        where: { partner_id: p.id },
      }),
      prisma.partnerWithdrawal.aggregate({
        _sum: { amount: true }, _count: true,
        where: { partner_id: p.id, type: 'profit_distribution' },
      }),
      prisma.partnerWithdrawal.findMany({
        where: { partner_id: p.id, type: 'profit_distribution' },
        orderBy: { occurred_at: 'desc' },
        take: 12,
      }),
    ])
    const contributions = Number(contribAgg._sum.amount ?? 0)
    const withdrawals = Number(withdrawAgg._sum.amount ?? 0)
    const distributions = Number(distroAgg._sum.amount ?? 0)

    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      is_active: p.is_active,
      shares: p.shares.map(s => ({
        scope_type: s.scope_type,
        scope_id: s.scope_id,
        percentage: Number(s.percentage),
      })),
      total_contributions: contributions,
      total_withdrawals: withdrawals,
      total_distributions_received: distributions,
      current_balance: contributions - withdrawals,
      contribution_count: contribAgg._count,
      withdrawal_count: withdrawAgg._count,
      recent_distributions: withdrawalsList.map(w => ({
        amount: Number(w.amount),
        period: `${w.period_month}/${w.period_year}`,
        date: w.occurred_at,
      })),
    }
  }))

  // Tenant totals
  const totals = enriched.reduce((acc, p) => ({
    contributions: acc.contributions + p.total_contributions,
    withdrawals: acc.withdrawals + p.total_withdrawals,
    distributions: acc.distributions + p.total_distributions_received,
    active_partners: acc.active_partners + (p.is_active ? 1 : 0),
  }), { contributions: 0, withdrawals: 0, distributions: 0, active_partners: 0 })

  // Recent distributions (cross-partner)
  const recentDistributions = await prisma.profitDistribution.findMany({
    where: { tenant_id: tenantId },
    include: { withdrawals: { include: { partner: { select: { name: true } } } } },
    orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    take: 12,
  })

  return NextResponse.json({
    summary: {
      total_partners: partners.length,
      active_partners: totals.active_partners,
      total_capital_invested: totals.contributions,
      total_distributed: totals.distributions,
    },
    partners: enriched,
    recent_distributions: recentDistributions.map(d => ({
      id: d.id,
      period: `${d.period_month}/${d.period_year}`,
      net_profit: Number(d.net_profit),
      partners_count: d.withdrawals.length,
      total_distributed: d.withdrawals.reduce((s, w) => s + Number(w.amount), 0),
      finalized_at: d.finalized_at,
    })),
  })
}
