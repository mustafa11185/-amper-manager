import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = user.id as string
  if (!staffId || user.role === 'owner') {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 })
  }

  try {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = thisMonthStart

    const [cfg, thisSumAgg, thisCount, thisShifts, lastSumAgg, lastCount, lastShifts, weekTxs] = await Promise.all([
      prisma.staffSalaryConfig.findUnique({ where: { staff_id: staffId } }).catch(() => null),
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: { staff_id: staffId, status: 'success', created_at: { gte: thisMonthStart, lt: thisMonthEnd } },
      }),
      prisma.posTransaction.count({
        where: { staff_id: staffId, status: 'success', created_at: { gte: thisMonthStart, lt: thisMonthEnd } },
      }),
      prisma.collectorShift.count({
        where: { staff_id: staffId, shift_date: { gte: thisMonthStart, lt: thisMonthEnd }, check_in_at: { not: null } },
      }),
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: { staff_id: staffId, status: 'success', created_at: { gte: lastMonthStart, lt: lastMonthEnd } },
      }),
      prisma.posTransaction.count({
        where: { staff_id: staffId, status: 'success', created_at: { gte: lastMonthStart, lt: lastMonthEnd } },
      }),
      prisma.collectorShift.count({
        where: { staff_id: staffId, shift_date: { gte: lastMonthStart, lt: lastMonthEnd }, check_in_at: { not: null } },
      }),
      prisma.posTransaction.findMany({
        where: {
          staff_id: staffId,
          status: 'success',
          created_at: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { created_at: true, amount: true },
      }),
    ])

    const thisCollected = Number(thisSumAgg._sum.amount ?? 0)
    const lastCollected = Number(lastSumAgg._sum.amount ?? 0)
    const changePct = lastCollected > 0
      ? Math.round(((thisCollected - lastCollected) / lastCollected) * 100)
      : (thisCollected > 0 ? 100 : 0)

    const monthlyAmount = Number((cfg as any)?.monthly_amount ?? 0)
    // Estimate hourly rate assuming ~180 hours/month
    const hourlyRate = monthlyAmount > 0 ? Math.round(monthlyAmount / 180) : 0

    // Weekly chart (last 7 days)
    const weekly: { day: string; date: string; count: number; amount: number }[] = []
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      const dayTxs = weekTxs.filter(t => t.created_at >= d && t.created_at < next)
      weekly.push({
        day: dayNames[d.getDay()],
        date: d.toISOString().slice(0, 10),
        count: dayTxs.length,
        amount: dayTxs.reduce((s, t) => s + Number(t.amount), 0),
      })
    }

    return NextResponse.json({
      this_month: {
        collected: thisCollected,
        payments: thisCount,
        days: thisShifts,
        hourly_rate: hourlyRate,
        monthly_salary: monthlyAmount,
      },
      last_month: {
        collected: lastCollected,
        payments: lastCount,
        days: lastShifts,
      },
      change_pct: changePct,
      weekly,
    })
  } catch (err: any) {
    console.error('[staff/my-stats]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
