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

  // Salaries are now per-CYCLE (user's explicit choice). If month/year
  // passed, treat as historical calendar lookup; otherwise use current
  // cycle's billing period.
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
    // Get all staff with salary config
    let staffList: any[] = []
    try {
      staffList = await prisma.staff.findMany({
        where: { tenant_id: tenantId, is_active: true, ...(branchId ? { branch_id: branchId } : {}) },
        select: { id: true, name: true, role: true, salary_config: true },
      })
    } catch (e: any) {
      console.log('Staff salary query failed:', e.message)
      // Fallback: get staff without salary_config
      const basic = await prisma.staff.findMany({
        where: { tenant_id: tenantId, is_active: true, ...(branchId ? { branch_id: branchId } : {}) },
        select: { id: true, name: true, role: true },
      })
      staffList = basic.map((s: any) => ({ ...s, salary_config: null }))
    }

    // Get salary payments this month
    const paidMap = new Map<string, number>()
    try {
      const payments = await prisma.salaryPayment.findMany({
        where: { tenant_id: tenantId, month, year },
      })
      for (const p of payments) {
        paidMap.set(p.staff_id, (paidMap.get(p.staff_id) || 0) + Number(p.amount))
      }
    } catch (e: any) {
      console.log('salary_payments query failed:', e.message)
    }

    let totalAgreed = 0, totalPaid = 0

    const staff = staffList
      .filter(s => s.salary_config && Number(s.salary_config.monthly_amount) > 0)
      .map(s => {
        const agreed = Number(s.salary_config!.monthly_amount)
        const paid = paidMap.get(s.id) || 0
        totalAgreed += agreed
        totalPaid += paid
        return {
          id: s.id, name: s.name, role: s.role,
          monthly_amount: agreed, paid, pending: Math.max(0, agreed - paid),
        }
      })

    return NextResponse.json({
      staff, total_agreed: totalAgreed, total_paid: totalPaid,
      total_pending: Math.max(0, totalAgreed - totalPaid), month, year,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
