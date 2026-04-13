import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) {
      return NextResponse.json({ forecast: 0, current_mtd: 0, days_remaining: 0, avg_daily: 0, confidence: 'low' })
    }

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
    const daysElapsed = now.getDate()
    const daysRemaining = daysInMonth - daysElapsed

    // Last 3 full months
    const months = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(currentYear, currentMonth - 1 - (i + 1), 1)
      return { m: d.getMonth() + 1, y: d.getFullYear() }
    })

    const [mtdAgg, ...pastAggs] = await Promise.all([
      prisma.invoice.aggregate({
        _sum: { amount_paid: true },
        where: { branch_id: { in: branchIds }, billing_month: currentMonth, billing_year: currentYear },
      }),
      ...months.map(({ m, y }) =>
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: { branch_id: { in: branchIds }, billing_month: m, billing_year: y },
        })
      ),
    ])

    const pastTotals = pastAggs.map(a => Number(a._sum.amount_paid ?? 0))
    const nonZero = pastTotals.filter(t => t > 0)
    const avgMonth = nonZero.length > 0 ? nonZero.reduce((s, t) => s + t, 0) / nonZero.length : 0
    const avgDaily = avgMonth / 30

    const currentMtd = Number(mtdAgg._sum.amount_paid ?? 0)
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
