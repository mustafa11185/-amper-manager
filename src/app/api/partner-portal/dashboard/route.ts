import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerByToken } from '../login/route'

// GET /api/partner-portal/dashboard
// Headers: Authorization: Bearer <partner_token>
// Returns read-only summary for the partner: their balance, share %, recent distributions
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partnerId = await getPartnerByToken(token)
  if (!partnerId) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      shares: { where: { effective_to: null } },
    },
  })
  if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const tenant = await prisma.tenant.findUnique({
    where: { id: partner.tenant_id },
    select: { name: true },
  })

  // Balance
  const [contribAgg, withdrawAgg] = await Promise.all([
    prisma.partnerContribution.aggregate({
      _sum: { amount: true },
      where: { partner_id: partnerId },
    }),
    prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { partner_id: partnerId },
    }),
  ])
  const totalContrib = Number(contribAgg._sum.amount ?? 0)
  const totalWithdraw = Number(withdrawAgg._sum.amount ?? 0)

  // Recent distributions (last 12)
  const recentDistributions = await prisma.partnerWithdrawal.findMany({
    where: { partner_id: partnerId, type: 'profit_distribution' },
    orderBy: { occurred_at: 'desc' },
    take: 12,
  })

  // Recent movements (last 20)
  const [contribs, withdraws] = await Promise.all([
    prisma.partnerContribution.findMany({
      where: { partner_id: partnerId },
      orderBy: { occurred_at: 'desc' },
      take: 10,
    }),
    prisma.partnerWithdrawal.findMany({
      where: { partner_id: partnerId },
      orderBy: { occurred_at: 'desc' },
      take: 10,
    }),
  ])

  const movements = [
    ...contribs.map(c => ({
      date: c.occurred_at,
      type: 'in',
      subtype: c.type,
      amount: Number(c.amount),
      description: c.description,
    })),
    ...withdraws.map(w => ({
      date: w.occurred_at,
      type: 'out',
      subtype: w.type,
      amount: Number(w.amount),
      description: w.description,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20)

  return NextResponse.json({
    tenant: { name: tenant?.name ?? '—' },
    partner: {
      id: partner.id,
      name: partner.name,
      shares: partner.shares,
    },
    balance: {
      total_contributions: totalContrib,
      total_withdrawals: totalWithdraw,
      current: totalContrib - totalWithdraw,
    },
    recent_distributions: recentDistributions.map(d => ({
      id: d.id,
      amount: Number(d.amount),
      period: `${d.period_month}/${d.period_year}`,
      date: d.occurred_at,
    })),
    movements,
  })
}
