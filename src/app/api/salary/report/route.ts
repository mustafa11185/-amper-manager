import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const url = req.nextUrl.searchParams
  const branchId = url.get('branch_id') || user.branchId
  const explicitMonth = url.get('month')
  const explicitYear = url.get('year')

  // Default to the current billing cycle's period when no explicit
  // month/year is provided. Salaries are per-cycle (user's choice),
  // so the salary report should roll over automatically when a new
  // generation is issued.
  let month: number
  let year: number
  if (explicitMonth && explicitYear) {
    month = parseInt(explicitMonth)
    year = parseInt(explicitYear)
  } else if (branchId) {
    const cycle = await getCurrentCycleWindow(branchId)
    month = cycle.month
    year = cycle.year
  } else {
    const now = new Date()
    month = now.getMonth() + 1
    year = now.getFullYear()
  }

  try {
    // 1. Get all active staff with salary configs
    const staffList = await prisma.staff.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(branchId ? { branch_id: branchId } : {}),
      },
      select: {
        id: true,
        name: true,
        role: true,
        salary_config: { select: { monthly_amount: true } },
      },
      orderBy: { name: 'asc' },
    })

    // 2. Get all salary payments this month, split by type
    const payments = await prisma.salaryPayment.findMany({
      where: { tenant_id: tenantId, month, year },
      select: {
        staff_id: true,
        amount: true,
        payment_type: true,
        paid_at: true,
      },
    })

    // Build maps: staffId -> { salary_paid, tips_total, last_payment_date }
    const payMap = new Map<string, { salary_paid: number; tips_total: number; last_date: string | null }>()
    for (const p of payments) {
      const entry = payMap.get(p.staff_id) || { salary_paid: 0, tips_total: 0, last_date: null }
      const amt = Number(p.amount)
      if (p.payment_type === 'tip') {
        entry.tips_total += amt
      } else {
        entry.salary_paid += amt
      }
      const paidAtStr = p.paid_at.toISOString()
      if (!entry.last_date || paidAtStr > entry.last_date) {
        entry.last_date = paidAtStr
      }
      payMap.set(p.staff_id, entry)
    }

    // 3. Build response
    let totalAgreed = 0
    let totalPaid = 0
    let totalTips = 0
    let totalRemaining = 0

    const staff = staffList.map(s => {
      const monthlyAmount = s.salary_config ? Number(s.salary_config.monthly_amount) : 0
      const entry = payMap.get(s.id) || { salary_paid: 0, tips_total: 0, last_date: null }
      const remaining = Math.max(0, monthlyAmount - entry.salary_paid)
      const progressPercent = monthlyAmount > 0 ? Math.min(100, Math.round((entry.salary_paid / monthlyAmount) * 100)) : 0

      let status: 'paid' | 'partial' | 'pending' = 'pending'
      if (entry.salary_paid >= monthlyAmount && monthlyAmount > 0) status = 'paid'
      else if (entry.salary_paid > 0) status = 'partial'

      totalAgreed += monthlyAmount
      totalPaid += entry.salary_paid
      totalTips += entry.tips_total
      totalRemaining += remaining

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        monthly_amount: monthlyAmount,
        salary_paid: entry.salary_paid,
        tips_total: entry.tips_total,
        remaining,
        status,
        progress_percent: progressPercent,
        last_payment_date: entry.last_date,
      }
    })

    return NextResponse.json({
      staff,
      total_agreed: totalAgreed,
      total_paid: totalPaid,
      total_tips: totalTips,
      total_remaining: totalRemaining,
      month,
      year,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
