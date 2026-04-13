import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) return NextResponse.json({ kabinas: [] })

    // Current cycle — billing period comes from the last non-reversed
    // generation for this branch, not the calendar month.
    const cycle = await getCurrentCycleWindow(branchIds[0])
    const month = cycle.month
    const year = cycle.year

    const alleys = await prisma.alley.findMany({
      where: { branch_id: { in: branchIds }, is_active: true },
      select: { id: true, name: true, branch_id: true },
      orderBy: { sort_order: 'asc' },
    })

    const result = await Promise.all(alleys.map(async (a) => {
      const subs = await prisma.subscriber.findMany({
        where: { alley_id: a.id, is_active: true },
        select: { id: true, total_debt: true },
      })
      const subIds = subs.map(s => s.id)
      const debt = subs.reduce((s, x) => s + Number(x.total_debt), 0)

      if (subIds.length === 0) {
        return {
          id: a.id,
          name: a.name,
          subscribers: 0,
          revenue: 0,
          debt: 0,
          rate: 0,
        }
      }

      const [revenueAgg, totalInv, paidInv] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: {
            subscriber_id: { in: subIds },
            billing_month: month,
            billing_year: year,
          },
        }),
        prisma.invoice.count({
          where: { subscriber_id: { in: subIds }, billing_month: month, billing_year: year },
        }),
        prisma.invoice.count({
          where: { subscriber_id: { in: subIds }, billing_month: month, billing_year: year, is_fully_paid: true },
        }),
      ])

      return {
        id: a.id,
        name: a.name,
        subscribers: subs.length,
        revenue: Number(revenueAgg._sum.amount_paid ?? 0),
        debt,
        rate: totalInv > 0 ? Math.round((paidInv / totalInv) * 100) : 0,
      }
    }))

    return NextResponse.json({ kabinas: result })
  } catch (err: any) {
    console.error('[reports/kabinas]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
