import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const branches = await prisma.branch.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { id: true, name: true },
    })

    const result = await Promise.all(branches.map(async (b) => {
      // Each branch has its own cycle — one may have regenerated
      // yesterday while another is still on last month's period,
      // so we look it up per-branch rather than once for the tenant.
      const cycle = await getCurrentCycleWindow(b.id)
      const [subs, revenue, totalInv, paidInv, debtAgg, staff] = await Promise.all([
        prisma.subscriber.count({ where: { branch_id: b.id, is_active: true } }),
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: { branch_id: b.id, billing_month: cycle.month, billing_year: cycle.year },
        }),
        prisma.invoice.count({
          where: { branch_id: b.id, billing_month: cycle.month, billing_year: cycle.year },
        }),
        prisma.invoice.count({
          where: { branch_id: b.id, billing_month: cycle.month, billing_year: cycle.year, is_fully_paid: true },
        }),
        prisma.subscriber.aggregate({
          _sum: { total_debt: true },
          where: { branch_id: b.id, is_active: true },
        }),
        prisma.staff.count({ where: { branch_id: b.id, is_active: true } }),
      ])
      return {
        id: b.id,
        name: b.name,
        subscribers: subs,
        revenue: Number(revenue._sum.amount_paid ?? 0),
        rate: totalInv > 0 ? Math.round((paidInv / totalInv) * 100) : 0,
        debt: Number(debtAgg._sum.total_debt ?? 0),
        staff,
      }
    }))

    return NextResponse.json({ branches: result })
  } catch (err: any) {
    console.error('[reports/branches-compare]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
