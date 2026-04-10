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
    if (branchIds.length === 0) return NextResponse.json({ subscribers: [] })

    const now = new Date()
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())

    // Get candidates: active subscribers with debt
    const candidates = await prisma.subscriber.findMany({
      where: {
        branch_id: { in: branchIds },
        is_active: true,
        total_debt: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        total_debt: true,
      },
      take: 500,
    })

    const result = await Promise.all(candidates.map(async (sub) => {
      const [lastThree, lastPaid] = await Promise.all([
        prisma.invoice.findMany({
          where: { subscriber_id: sub.id, is_reversed: false },
          orderBy: [{ billing_year: 'desc' }, { billing_month: 'desc' }],
          take: 3,
          select: { is_fully_paid: true, billing_month: true, billing_year: true },
        }),
        prisma.invoice.findFirst({
          where: { subscriber_id: sub.id, is_fully_paid: true, is_reversed: false },
          orderBy: { updated_at: 'desc' },
          select: { updated_at: true },
        }),
      ])

      if (lastThree.length < 3) return null
      const allUnpaid = lastThree.every(i => !i.is_fully_paid)
      const noRecentPay = !lastPaid || lastPaid.updated_at < cutoff
      if (!allUnpaid && !noRecentPay) return null

      const monthsInactive = lastPaid
        ? Math.floor((now.getTime() - lastPaid.updated_at.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 99

      return {
        id: sub.id,
        name: sub.name,
        phone: sub.phone,
        last_payment_at: lastPaid?.updated_at ?? null,
        months_inactive: monthsInactive,
        debt: Number(sub.total_debt),
      }
    }))

    const subscribers = result.filter(Boolean).sort((a: any, b: any) => b.months_inactive - a.months_inactive)

    return NextResponse.json({ subscribers })
  } catch (err: any) {
    console.error('[reports/churn]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
