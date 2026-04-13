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
      return NextResponse.json({
        forecast: 0,
        current_mtd: 0,
        total_due: 0,
        days_remaining: 0,
        avg_daily: 0,
        confidence: 'low',
      })
    }

    // Current CYCLE window — forecast projects to the end of this
    // cycle (30-day target), not the end of the calendar month.
    const cycle = await getCurrentCycleWindow(branchIds[0])
    const now = new Date()
    const CYCLE_LENGTH_DAYS = 30
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - cycle.start.getTime()) / (1000 * 60 * 60 * 24)))
    const daysRemaining = Math.max(0, CYCLE_LENGTH_DAYS - daysElapsed)

    // Past 3 cycles — pull the prior non-reversed generation logs.
    // We read historical amount_paid by (billing_month, billing_year)
    // instead of a time window so numbers MATCH the financial
    // report (total_collected) and the revenue bars.
    const priorLogs = await prisma.invoiceGenerationLog.findMany({
      where: { branch_id: branchIds[0], is_reversed: false },
      orderBy: { generated_at: 'desc' },
      take: 4, // current + 3 prior
      select: { generated_at: true, billing_month: true, billing_year: true },
    }).catch(() => [] as Array<{ generated_at: Date; billing_month: number; billing_year: number }>)

    const past: Array<{ m: number; y: number }> = []
    if (priorLogs.length >= 2) {
      for (let i = 1; i < priorLogs.length; i++) {
        past.push({
          m: priorLogs[i].billing_month,
          y: priorLogs[i].billing_year,
        })
      }
    } else {
      // Fallback: last 3 calendar months
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        past.push({ m: d.getMonth() + 1, y: d.getFullYear() })
      }
    }

    // Current cycle "collected so far" = sum(amount_paid) on the
    // CURRENT cycle's invoices PLUS any debt collections logged
    // during the cycle window. Matches /reports/financial's
    // total_collected so the forecast screen and the financial
    // report show the same baseline number.
    const [currentAgg, debtLogsNow, ...pastAggs] = await Promise.all([
      prisma.invoice.aggregate({
        _sum: { amount_paid: true, total_amount_due: true },
        where: {
          branch_id: { in: branchIds },
          billing_month: cycle.month,
          billing_year: cycle.year,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          action: 'debt_collected',
          tenant_id: tenantId,
          branch_id: { in: branchIds },
          created_at: { gte: cycle.start },
        },
        select: { new_value: true },
      }).catch(() => [] as Array<{ new_value: unknown }>),
      ...past.map(({ m, y }) =>
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: {
            branch_id: { in: branchIds },
            billing_month: m,
            billing_year: y,
          },
        }).then(a => Number(a._sum.amount_paid ?? 0))
      ),
    ])

    const pastTotals = pastAggs as number[]
    const nonZero = pastTotals.filter(t => t > 0)
    const avgMonth = nonZero.length > 0 ? nonZero.reduce((s, t) => s + t, 0) / nonZero.length : 0
    const avgDaily = avgMonth / CYCLE_LENGTH_DAYS

    let debtCollectedNow = 0
    for (const r of debtLogsNow) {
      debtCollectedNow += Number((r.new_value as { amount?: number } | null)?.amount ?? 0)
    }
    const invoiceCollected = Number(currentAgg._sum.amount_paid ?? 0)
    const currentMtd = invoiceCollected + debtCollectedNow
    const totalDue = Number(currentAgg._sum.total_amount_due ?? 0)
    // Forecast = collected so far + (avg daily rate × remaining days).
    // Cap at the cycle's total_due — no point projecting more than
    // the invoices actually charge for this cycle.
    const rawForecast = currentMtd + (avgDaily * daysRemaining)
    const forecast = totalDue > 0
      ? Math.round(Math.min(rawForecast, totalDue))
      : Math.round(rawForecast)

    let confidence: 'low' | 'medium' | 'high' = 'low'
    if (nonZero.length === 3) confidence = 'high'
    else if (nonZero.length === 2) confidence = 'medium'

    return NextResponse.json({
      forecast,
      current_mtd: currentMtd,
      total_due: totalDue,
      collection_rate: totalDue > 0 ? Math.round((currentMtd / totalDue) * 100) : 0,
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
