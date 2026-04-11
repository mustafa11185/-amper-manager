export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerByToken } from '../login/route'

// GET /api/partner-portal/financials
// Returns this month's revenue + expenses for the tenant. Each block
// is independently gated:
//   - revenue       requires `view_revenue`
//   - expenses      requires `view_expenses`
//   - subscribers   requires `view_subscribers_count` (default true)
// Plus a 6-month trend so the partner can see the project trajectory.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partnerId = await getPartnerByToken(token)
  if (!partnerId) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  const me = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { tenant_id: true, permissions: true },
  })
  if (!me) return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })

  const perms = (me.permissions ?? {}) as Record<string, boolean>
  const canRevenue = perms.view_revenue === true
  const canExpenses = perms.view_expenses === true
  const canSubscribers = perms.view_subscribers_count !== false

  // All branches under this tenant
  const branches = await prisma.branch.findMany({
    where: { tenant_id: me.tenant_id },
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  let revenueMonth = 0
  let expensesMonth = 0
  let subscribersCount = 0
  const trend: { month: string; revenue: number; expenses: number; net: number }[] = []

  if (canRevenue) {
    const agg = await prisma.invoice.aggregate({
      _sum: { amount_paid: true },
      where: {
        branch_id: { in: branchIds },
        is_fully_paid: true,
        updated_at: { gte: monthStart },
      },
    })
    revenueMonth = Number(agg._sum.amount_paid ?? 0)
  }

  if (canExpenses) {
    try {
      const agg = await prisma.expense.aggregate({
        _sum: { amount: true },
        where: { branch_id: { in: branchIds }, created_at: { gte: monthStart } },
      })
      expensesMonth = Number(agg._sum.amount ?? 0)
    } catch (err: any) {
      console.warn('[partner-portal/financials] expenses lookup failed:', err.message)
    }
  }

  if (canSubscribers) {
    subscribersCount = await prisma.subscriber.count({
      where: { branch_id: { in: branchIds }, is_active: true },
    })
  }

  // 6-month trend (only when at least one financial perm is on)
  if (canRevenue || canExpenses) {
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const [revAgg, expAgg] = await Promise.all([
        canRevenue
          ? prisma.invoice.aggregate({
              _sum: { amount_paid: true },
              where: {
                branch_id: { in: branchIds },
                is_fully_paid: true,
                updated_at: { gte: start, lt: end },
              },
            })
          : Promise.resolve({ _sum: { amount_paid: 0 } } as any),
        canExpenses
          ? prisma.expense.aggregate({
              _sum: { amount: true },
              where: { branch_id: { in: branchIds }, created_at: { gte: start, lt: end } },
            }).catch(() => ({ _sum: { amount: 0 } } as any))
          : Promise.resolve({ _sum: { amount: 0 } } as any),
      ])
      const rev = Number(revAgg._sum.amount_paid ?? 0)
      const exp = Number(expAgg._sum.amount ?? 0)
      trend.push({
        month: `${start.getMonth() + 1}/${start.getFullYear()}`,
        revenue: rev,
        expenses: exp,
        net: rev - exp,
      })
    }
  }

  return NextResponse.json({
    revenue: canRevenue ? revenueMonth : null,
    expenses: canExpenses ? expensesMonth : null,
    net: (canRevenue && canExpenses) ? revenueMonth - expensesMonth : null,
    subscribers: canSubscribers ? subscribersCount : null,
    trend,
    permissions: {
      revenue: canRevenue,
      expenses: canExpenses,
      subscribers: canSubscribers,
    },
  })
}
