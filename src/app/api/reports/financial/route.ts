import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCycleWindow, getPreviousCycleWindow } from '@/lib/billing-cycle'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const url = req.nextUrl.searchParams
  const branchId = url.get('branch_id') || user.branchId
  const explicitMonth = url.get('month')
  const explicitYear = url.get('year')

  try {
    // If caller passed month/year, treat as historical calendar view;
    // otherwise use the current cycle window (the default).
    let month: number
    let year: number
    let periodStart: Date
    let periodEnd: Date
    let prevStart: Date
    let prevEnd: Date
    let prevMonth: number
    let prevYear: number

    if (explicitMonth && explicitYear) {
      month = parseInt(explicitMonth)
      year = parseInt(explicitYear)
      periodStart = new Date(year, month - 1, 1)
      periodEnd = new Date(year, month, 1)
      prevMonth = month === 1 ? 12 : month - 1
      prevYear = month === 1 ? year - 1 : year
      prevStart = new Date(prevYear, prevMonth - 1, 1)
      prevEnd = periodStart
    } else if (branchId) {
      const [cycle, prev] = await Promise.all([
        getCurrentCycleWindow(branchId),
        getPreviousCycleWindow(branchId),
      ])
      month = cycle.month
      year = cycle.year
      periodStart = cycle.start
      periodEnd = new Date()
      prevStart = prev.start
      prevEnd = prev.end
      prevMonth = prev.month
      prevYear = prev.year
    } else {
      const now = new Date()
      month = now.getMonth() + 1
      year = now.getFullYear()
      periodStart = new Date(year, month - 1, 1)
      periodEnd = new Date(year, month, 1)
      prevMonth = month === 1 ? 12 : month - 1
      prevYear = month === 1 ? year - 1 : year
      prevStart = new Date(prevYear, prevMonth - 1, 1)
      prevEnd = periodStart
    }

    const monthStart = periodStart
    const monthEnd = periodEnd
    const where: any = { tenant_id: tenantId }
    if (branchId) where.branch_id = branchId

    // Invoices this cycle — powers total_due (the ceiling) and the
    // base of total_collected. The base is sum(amount_paid) on this
    // cycle's own invoices; we then ADD any debt collections that
    // happened inside the cycle window on top. See the audit-log
    // query below — without it, paying down an old debt would
    // vanish from the revenue card even though the cash was real.
    const invoiceAgg = await prisma.invoice.aggregate({
      where: { ...where, billing_month: month, billing_year: year },
      _sum: { total_amount_due: true, amount_paid: true },
      _count: true,
    })
    const totalDue = Number(invoiceAgg._sum.total_amount_due || 0)
    const invoiceCollected = Number(invoiceAgg._sum.amount_paid || 0)

    // Sum 'debt_collected' audit entries for the cycle window.
    // pos/payment and sync/payment both emit this action with
    // new_value.amount set to the dinars that reduced total_debt
    // on the subscriber.
    const debtLogs = await prisma.auditLog.findMany({
      where: {
        action: 'debt_collected',
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        created_at: { gte: monthStart },
      },
      select: { new_value: true },
    }).catch(() => [] as Array<{ new_value: unknown }>)
    let debtCollectedCycle = 0
    for (const row of debtLogs) {
      const v = row.new_value as { amount?: number } | null
      debtCollectedCycle += Number(v?.amount ?? 0)
    }
    const totalCollected = invoiceCollected + debtCollectedCycle

    // Separately, expose the real cash flow for this cycle so
    // dashboards or future widgets that want "actual dinars in"
    // can still get it without another refactor.
    const [cashThisCycleAgg, onlineThisCycleAgg] = await Promise.all([
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          status: 'success',
          created_at: { gte: monthStart },
        },
      }),
      prisma.onlinePayment.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          status: 'success',
          created_at: { gte: monthStart },
        },
      }),
    ])
    const cycleCashIn =
      Number(cashThisCycleAgg._sum.amount || 0) +
      Number(onlineThisCycleAgg._sum.amount || 0)

    // Unpaid count — invoices of the current cycle that still
    // have an outstanding balance.
    const unpaidCount = await prisma.invoice.count({
      where: { ...where, billing_month: month, billing_year: year, is_fully_paid: false },
    })

    // Real outstanding amount owed to the owner right now =
    //   (remaining balance on every unpaid invoice, any period)
    // + (accumulated debt on active subscribers from prior cycles)
    //
    // The old computation `total_due - total_collected` was wrong
    // because it mixed a current-cycle theoretical ceiling with a
    // cash-in number that includes late payments for OLDER invoices.
    // This new query returns exactly what subscribers still owe.
    const [unpaidInvoicesAgg, debtAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { ...where, is_fully_paid: false },
        _sum: { total_amount_due: true, amount_paid: true },
      }),
      prisma.subscriber.aggregate({
        _sum: { total_debt: true },
        where: {
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          is_active: true,
        },
      }),
    ])
    const unpaidInvoiceRemaining =
      Number(unpaidInvoicesAgg._sum.total_amount_due || 0) -
      Number(unpaidInvoicesAgg._sum.amount_paid || 0)
    const totalDebt = Number(debtAgg._sum.total_debt || 0)
    const realUncollected = Math.max(0, unpaidInvoiceRemaining) + totalDebt

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

    // Online payments
    const onlineAgg = await prisma.onlinePayment.aggregate({
      where: { tenant_id: tenantId, status: 'success', created_at: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
      _count: true,
    })
    const onlineTotal = Number(onlineAgg._sum.amount || 0)
    const onlineCount = onlineAgg._count || 0

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

    // Previous period — same definition as current (invoice
    // amount_paid for that period + debt_collected audit entries
    // inside the prev window) so the comparison is apples-to-apples.
    const [prevInvoiceAgg, prevDebtLogs, prevExpAgg] = await Promise.all([
      prisma.invoice.aggregate({
        _sum: { amount_paid: true },
        where: { ...where, billing_month: prevMonth, billing_year: prevYear },
      }),
      prisma.auditLog.findMany({
        where: {
          action: 'debt_collected',
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          created_at: { gte: prevStart, lt: prevEnd },
        },
        select: { new_value: true },
      }).catch(() => [] as Array<{ new_value: unknown }>),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { ...(branchId ? { branch_id: branchId } : {}), created_at: { gte: prevStart, lt: prevEnd } },
      }),
    ])
    let prevDebtCollected = 0
    for (const row of prevDebtLogs) {
      const v = row.new_value as { amount?: number } | null
      prevDebtCollected += Number(v?.amount ?? 0)
    }
    const prevCollected = Number(prevInvoiceAgg._sum.amount_paid || 0) + prevDebtCollected
    const prevNet = prevCollected - Number(prevExpAgg._sum.amount || 0)
    const growthPercent = prevCollected > 0 ? Math.round(((totalCollected - prevCollected) / prevCollected) * 100) : 0

    return NextResponse.json({
      total_due: totalDue,
      total_collected: totalCollected,
      // Break-out so the UI can show "from invoices" vs "from debt"
      invoice_collected: invoiceCollected,
      debt_collected: debtCollectedCycle,
      // Real cash flow for this cycle (POS + Online since cycle
      // start). Kept separate from total_collected so widgets can
      // choose whichever view they need without another refactor.
      cycle_cash_in: cycleCashIn,
      // Actual money still owed: unpaid invoice remainders + rolled-
      // over subscriber debt. The UI widget binds to this value so
      // "غير مدفوع" reflects real outstanding, not a subtraction.
      total_uncollected: realUncollected,
      unpaid_invoice_remaining: Math.max(0, unpaidInvoiceRemaining),
      total_debt: totalDebt,
      collection_rate: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
      subscribers_count: subsCount,
      unpaid_count: unpaidCount,
      online_payments: { count: onlineCount, total: onlineTotal },
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
