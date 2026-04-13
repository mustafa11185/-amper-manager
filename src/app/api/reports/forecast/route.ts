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
    if (branchIds.length === 0) {
      return NextResponse.json({ forecast: 0, current_mtd: 0, days_remaining: 0, avg_daily: 0, confidence: 'low' })
    }

    // Current CYCLE window — forecast projects to the end of this
    // cycle (30-day target), not the end of the calendar month.
    const cycle = await getCurrentCycleWindow(branchIds[0])
    const now = new Date()
    const CYCLE_LENGTH_DAYS = 30
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - cycle.start.getTime()) / (1000 * 60 * 60 * 24)))
    const daysRemaining = Math.max(0, CYCLE_LENGTH_DAYS - daysElapsed)

    // Past 3 cycles — pull the prior non-reversed generation logs
    // and use each one's (billing_month, billing_year) to fetch
    // historical cash flow. Falls back to last 3 calendar months
    // if the log table is thin.
    const priorLogs = await prisma.invoiceGenerationLog.findMany({
      where: { branch_id: branchIds[0], is_reversed: false },
      orderBy: { generated_at: 'desc' },
      take: 4, // current + 3 prior
      select: { generated_at: true, billing_month: true, billing_year: true },
    }).catch(() => [] as Array<{ generated_at: Date; billing_month: number; billing_year: number }>)

    const past: Array<{ m: number; y: number; start: Date; end: Date }> = []
    if (priorLogs.length >= 2) {
      // Use the windows between consecutive logs.
      for (let i = 1; i < priorLogs.length; i++) {
        const start = priorLogs[i].generated_at
        const end = priorLogs[i - 1].generated_at
        past.push({
          m: priorLogs[i].billing_month,
          y: priorLogs[i].billing_year,
          start,
          end,
        })
      }
    } else {
      // Fallback: last 3 calendar months
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const end = new Date(now.getFullYear(), now.getMonth() - (i - 1), 1)
        past.push({
          m: d.getMonth() + 1,
          y: d.getFullYear(),
          start: d,
          end,
        })
      }
    }

    // Current cycle revenue = actual cash received since cycle start
    // (POS + Online). This matches the financial report's
    // "total_collected" so the forecast card and the financial card
    // agree.
    const [cashNowAgg, onlineNowAgg, ...pastAggs] = await Promise.all([
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          branch_id: { in: branchIds },
          status: 'success',
          created_at: { gte: cycle.start },
        },
      }),
      prisma.onlinePayment.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          status: 'success',
          created_at: { gte: cycle.start },
        },
      }),
      ...past.map(async ({ start, end }) => {
        const [cash, online] = await Promise.all([
          prisma.posTransaction.aggregate({
            _sum: { amount: true },
            where: {
              tenant_id: tenantId,
              branch_id: { in: branchIds },
              status: 'success',
              created_at: { gte: start, lt: end },
            },
          }),
          prisma.onlinePayment.aggregate({
            _sum: { amount: true },
            where: {
              tenant_id: tenantId,
              status: 'success',
              created_at: { gte: start, lt: end },
            },
          }),
        ])
        return Number(cash._sum.amount ?? 0) + Number(online._sum.amount ?? 0)
      }),
    ])

    const pastTotals = pastAggs as number[]
    const nonZero = pastTotals.filter(t => t > 0)
    const avgMonth = nonZero.length > 0 ? nonZero.reduce((s, t) => s + t, 0) / nonZero.length : 0
    const avgDaily = avgMonth / CYCLE_LENGTH_DAYS

    const currentMtd = Number(cashNowAgg._sum.amount ?? 0) + Number(onlineNowAgg._sum.amount ?? 0)
    const forecast = Math.round(currentMtd + (avgDaily * daysRemaining))

    let confidence: 'low' | 'medium' | 'high' = 'low'
    if (nonZero.length === 3) confidence = 'high'
    else if (nonZero.length === 2) confidence = 'medium'

    return NextResponse.json({
      forecast,
      current_mtd: currentMtd,
      days_remaining: daysRemaining,
      days_elapsed: daysElapsed,
      avg_daily: Math.round(avgDaily),
      avg_month: Math.round(avgMonth),
      confidence,
      past_months: pastTotals,
    })
  } catch (err: any) {
    console.error('[reports/forecast]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
