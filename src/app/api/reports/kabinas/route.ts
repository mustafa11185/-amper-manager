import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const branches = await prisma.branch.findMany({
      where: user.role === 'owner' ? { tenant_id: tenantId } : { id: user.branchId },
      select: { id: true },
    })
    const branchIds = branches.map(b => b.id)
    if (branchIds.length === 0) return NextResponse.json({ kabinas: [] })

    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

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
