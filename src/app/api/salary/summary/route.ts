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
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(branchId ? { branch_id: branchId } : {}),
      },
      select: {
        id: true, name: true, role: true,
        salary: true,
      },
    })

    // Get collection totals per staff for this month
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 1)

    const wallets = await prisma.collectorWallet.findMany({
      where: { tenant_id: tenantId, ...(branchId ? { branch_id: branchId } : {}) },
      select: { staff_id: true, total_collected: true },
    })
    const collectedMap = new Map(wallets.map(w => [w.staff_id, Number(w.total_collected)]))

    // Get salary payments this month
    const payments = await prisma.salaryPayment.findMany({
      where: { tenant_id: tenantId, month, year },
    })
    const paidMap = new Map<string, number>()
    for (const p of payments) {
      paidMap.set(p.staff_id, (paidMap.get(p.staff_id) || 0) + Number(p.amount))
    }

    let totalSalaries = 0
    let totalPaid = 0

    const staff = staffList.map(s => {
      const sal = s.salary
      const salaryType = sal?.salary_type || 'none'
      const fixedAmount = Number(sal?.fixed_amount || 0)
      const commissionRate = Number(sal?.commission_rate || 0)
      const totalCollected = collectedMap.get(s.id) || 0

      let calculatedSalary = 0
      if (salaryType === 'fixed') calculatedSalary = fixedAmount
      else if (salaryType === 'percentage') calculatedSalary = Math.round(totalCollected * commissionRate / 100)
      else if (salaryType === 'fixed_plus_commission') calculatedSalary = fixedAmount + Math.round(totalCollected * commissionRate / 100)

      const paid = paidMap.get(s.id) || 0
      totalSalaries += calculatedSalary
      totalPaid += paid

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        salary_type: salaryType,
        fixed_amount: fixedAmount,
        commission_rate: commissionRate,
        total_collected: totalCollected,
        calculated_salary: calculatedSalary,
        salary_paid: paid,
        salary_pending: Math.max(0, calculatedSalary - paid),
      }
    }).filter(s => s.salary_type !== 'none')

    return NextResponse.json({
      staff,
      total_salaries: totalSalaries,
      total_paid: totalPaid,
      total_pending: Math.max(0, totalSalaries - totalPaid),
      month, year,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
