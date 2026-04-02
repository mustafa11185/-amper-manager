import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const url = req.nextUrl.searchParams
  const month = parseInt(url.get('month') || `${new Date().getMonth() + 1}`)
  const year = parseInt(url.get('year') || `${new Date().getFullYear()}`)
  const branchId = url.get('branch_id') || user.branchId

  try {
    // Get all staff with salary config
    const staffList = await prisma.staff.findMany({
      where: { tenant_id: tenantId, is_active: true, ...(branchId ? { branch_id: branchId } : {}) },
      select: { id: true, name: true, role: true, salary_config: true },
    })

    // Get salary payments this month
    const payments = await prisma.salaryPayment.findMany({
      where: { tenant_id: tenantId, month, year },
    })
    const paidMap = new Map<string, number>()
    for (const p of payments) {
      paidMap.set(p.staff_id, (paidMap.get(p.staff_id) || 0) + Number(p.amount))
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
