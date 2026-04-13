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
  const tenantId = user.tenantId as string

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) return NextResponse.json({ collectors: [] })

    // Leaderboard is cycle-scoped: counts payments/shifts since last
    // invoice generation so "ترتيب هذا الشهر" resets with each cycle.
    const cycle = await getCurrentCycleWindow(branchIds[0])
    const monthStart = cycle.start

    const collectors = await prisma.staff.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        role: 'collector',
        branch_id: { in: branchIds },
      },
      select: { id: true, name: true },
    })

    const stats = await Promise.all(collectors.map(async (c) => {
      const [sumAgg, payCount, shiftCount, perm] = await Promise.all([
        prisma.posTransaction.aggregate({
          _sum: { amount: true },
          where: { staff_id: c.id, created_at: { gte: monthStart }, status: 'success' },
        }),
        prisma.posTransaction.count({
          where: { staff_id: c.id, created_at: { gte: monthStart }, status: 'success' },
        }),
        prisma.collectorShift.count({
          where: { staff_id: c.id, shift_date: { gte: monthStart }, check_in_at: { not: null } },
        }),
        prisma.collectorPermission.findUnique({ where: { staff_id: c.id } }),
      ])
      const collected = Number(sumAgg._sum.amount ?? 0)
      const target = (perm?.daily_target ?? 0) * Math.max(shiftCount, 1)
      const rate = target > 0 ? Math.round((payCount / target) * 100) : 0
      return {
        id: c.id,
        name: c.name,
        collected,
        payments: payCount,
        days: shiftCount,
        rate,
      }
    }))

    stats.sort((a, b) => b.collected - a.collected)
    const ranked = stats.map((s, i) => ({ ...s, rank: i + 1 }))

    return NextResponse.json({ collectors: ranked })
  } catch (err: any) {
    console.error('[reports/leaderboard]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
