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
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 1)
    const where: any = { tenant_id: tenantId }
    if (branchId) where.branch_id = branchId

    // Invoices this month
    const invoiceAgg = await prisma.invoice.aggregate({
      where: { ...where, billing_month: month, billing_year: year },
      _sum: { total_amount_due: true, amount_paid: true },
      _count: true,
    })
    const totalDue = Number(invoiceAgg._sum.total_amount_due || 0)
    const totalCollected = Number(invoiceAgg._sum.amount_paid || 0)

    // Unpaid count
    const unpaidCount = await prisma.invoice.count({
      where: { ...where, billing_month: month, billing_year: year, is_fully_paid: false },
    })

    // Subscribers
    const subsCount = await prisma.subscriber.count({ where: { tenant_id: tenantId, is_active: true } })

    // Salary payments
    const salaryAgg = await prisma.salaryPayment.aggregate({
      where: { tenant_id: tenantId, month, year, payment_type: 'salary' },
      _sum: { amount: true },
    })
    const tipAgg = await prisma.salaryPayment.aggregate({
      where: { tenant_id: tenantId, month, year, payment_type: 'tip' },
      _sum: { amount: true },
    })
    const salaries = Number(salaryAgg._sum.amount || 0)
    const tips = Number(tipAgg._sum.amount || 0)

    // Other expenses
    const expenseAgg = await prisma.expense.aggregate({
      where: { ...(branchId ? { branch_id: branchId } : {}), created_at: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    })
    const otherExpenses = Number(expenseAgg._sum.amount || 0)

    // Approved collector discounts
    const discountAgg = await prisma.collectorDiscountRequest.aggregate({
      where: { tenant_id: tenantId, status: 'approved', created_at: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    })
    const approvedDiscounts = Number(discountAgg._sum.amount || 0)

    const totalExpenses = salaries + tips + otherExpenses + approvedDiscounts

    // Staff wallets
    const wallets = await prisma.collectorWallet.findMany({ where })
    const staffIds = wallets.map(w => w.staff_id)
    const staffList = await prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, name: true, salary_config: { select: { monthly_amount: true } } },
    })
    const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]))

    // Staff salary paid
    const salaryPayments = await prisma.salaryPayment.findMany({
      where: { tenant_id: tenantId, month, year },
      select: { staff_id: true, amount: true },
    })
    const salaryByStaff = new Map<string, number>()
    for (const p of salaryPayments) {
      salaryByStaff.set(p.staff_id, (salaryByStaff.get(p.staff_id) || 0) + Number(p.amount))
    }

    // Staff collections this month
    const collections = await prisma.posTransaction.groupBy({
      by: ['staff_id'],
      where: { tenant_id: tenantId, status: 'success', created_at: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    })
    const collectByStaff = Object.fromEntries(collections.map(c => [c.staff_id, Number(c._sum.amount || 0)]))

    const staffWallets = wallets.map(w => {
      const s = staffMap[w.staff_id]
      return {
        id: w.staff_id,
        name: s?.name || '',
        wallet_balance: Number(w.balance),
        collected_this_month: collectByStaff[w.staff_id] || 0,
        salary_paid: salaryByStaff.get(w.staff_id) || 0,
        salary_agreed: s?.salary_config ? Number(s.salary_config.monthly_amount) : 0,
      }
    })

    // Previous month
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevAgg = await prisma.invoice.aggregate({
      where: { ...where, billing_month: prevMonth, billing_year: prevYear },
      _sum: { amount_paid: true, total_amount_due: true },
    })
    const prevCollected = Number(prevAgg._sum.amount_paid || 0)
    const prevExpAgg = await prisma.expense.aggregate({
      where: { ...(branchId ? { branch_id: branchId } : {}), created_at: { gte: new Date(prevYear, prevMonth - 1, 1), lt: monthStart } },
      _sum: { amount: true },
    })
    const prevNet = prevCollected - Number(prevExpAgg._sum.amount || 0)
    const growthPercent = prevCollected > 0 ? Math.round(((totalCollected - prevCollected) / prevCollected) * 100) : 0

    return NextResponse.json({
      total_due: totalDue,
      total_collected: totalCollected,
      total_uncollected: Math.max(0, totalDue - totalCollected),
      collection_rate: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
      subscribers_count: subsCount,
      unpaid_count: unpaidCount,
      expenses: { salaries, tips, discounts: approvedDiscounts, other: otherExpenses, total: totalExpenses },
      net_profit: totalCollected - totalExpenses,
      staff_wallets: staffWallets,
      previous_month: { total_collected: prevCollected, net_profit: prevNet, growth_percent: growthPercent },
      month, year,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
