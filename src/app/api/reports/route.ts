import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'
import { getCurrentCycleWindow, getPreviousCycleWindow } from '@/lib/billing-cycle'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const branchIds = await resolveBranchIds(req, user)
  if (branchIds.length === 0) return NextResponse.json({ error: 'لا يوجد فرع' }, { status: 404 })

  // Every "هذا الشهر" on the reports hub actually means "this
  // billing cycle" — from the last non-reversed invoice generation
  // for the active branch up to now. Calendar-based month filters
  // made the reports show old-cycle numbers after a mid-month
  // regeneration.
  const now = new Date()
  const cycle = await getCurrentCycleWindow(branchIds[0])
  const prevCycle = await getPreviousCycleWindow(branchIds[0])
  const currentMonth = cycle.month
  const currentYear = cycle.year
  const monthStart = cycle.start
  const prevStart = prevCycle.start
  const prevEnd = prevCycle.end

  try {
    // ══════════════════════════════════════════
    //  BATCH 1: All independent queries in parallel
    // ══════════════════════════════════════════
    const [
      cashThisMonth,
      onlineThisMonth,
      cashLastMonth,
      onlineLastMonth,
      totalDebtAgg,
      totalInvoices,
      paidInvoices,
      totalActive,
      goldCount,
      normalCount,
      goldAmp,
      normalAmp,
      unpaidSubs,
      staff,
      allStaff,
      expensesThisMonth,
      onlinePayments,
    ] = await Promise.all([
      // cash_this_month / online_this_month now mean "actual cash
      // received during this CYCLE window" — POS success + online
      // success since cycle start. Previously this was invoice-based
      // amount_paid which diverged from the financial report widget.
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          branch_id: { in: branchIds },
          status: 'success',
          created_at: { gte: monthStart },
        },
      }),
      prisma.onlinePayment.aggregate({
        _sum: { amount: true },
        where: { tenant_id: tenantId, status: 'success', created_at: { gte: monthStart } },
      }),
      // Previous cycle equivalents — power the hub hero "vs last
      // month" comparison. Without these the Flutter hub always
      // showed 0% change because cash_last_month didn't exist.
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          branch_id: { in: branchIds },
          status: 'success',
          created_at: { gte: prevStart, lt: prevEnd },
        },
      }),
      prisma.onlinePayment.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          status: 'success',
          created_at: { gte: prevStart, lt: prevEnd },
        },
      }),
      prisma.subscriber.aggregate({
        _sum: { total_debt: true },
        where: { branch_id: { in: branchIds }, is_active: true },
      }),
      prisma.invoice.count({
        where: { branch_id: { in: branchIds }, billing_month: currentMonth, billing_year: currentYear },
      }),
      prisma.invoice.count({
        where: { branch_id: { in: branchIds }, billing_month: currentMonth, billing_year: currentYear, is_fully_paid: true },
      }),
      prisma.subscriber.count({ where: { branch_id: { in: branchIds }, is_active: true } }),
      prisma.subscriber.count({ where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'gold' } }),
      prisma.subscriber.count({ where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'normal' } }),
      prisma.subscriber.aggregate({ _sum: { amperage: true }, where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'gold' } }),
      prisma.subscriber.aggregate({ _sum: { amperage: true }, where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'normal' } }),
      prisma.subscriber.findMany({
        where: { branch_id: { in: branchIds }, is_active: true, total_debt: { gt: 0 } },
        select: { id: true, name: true, total_debt: true },
        orderBy: { total_debt: 'desc' },
        take: 5,
      }),
      prisma.staff.findMany({
        where: { tenant_id: tenantId, is_active: true, role: 'collector' },
        select: { id: true, name: true },
      }),
      prisma.staff.findMany({
        where: { tenant_id: tenantId, is_active: true, role: { in: ['collector', 'operator'] } },
        select: { id: true, name: true, role: true },
      }),
      prisma.expense.findMany({
        where: { branch_id: { in: branchIds }, created_at: { gte: monthStart } },
      }),
      prisma.onlinePayment.findMany({
        where: { tenant_id: tenantId, created_at: { gte: monthStart } },
        orderBy: { created_at: 'desc' },
      }),
    ])

    // ══════════════════════════════════════════
    //  BATCH 2: Revenue history (6 months parallel)
    // ══════════════════════════════════════════
    const monthlyRevenue = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(currentYear, currentMonth - 1 - (5 - i), 1)
        const m = d.getMonth() + 1
        const y = d.getFullYear()
        return prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: { branch_id: { in: branchIds }, billing_month: m, billing_year: y },
        }).then(agg => ({ month: m, year: y, total: Number(agg._sum.amount_paid ?? 0) }))
      })
    )

    // ══════════════════════════════════════════
    //  BATCH 3: Collector stats (batch queries — no N+1)
    // ══════════════════════════════════════════
    const staffIds = staff.map(s => s.id)
    const allStaffIds = allStaff.map(s => s.id)

    const [allWallets, paymentCounts, collectorShiftsAll, operatorShiftsAll] = await Promise.all([
      staffIds.length > 0
        ? prisma.collectorWallet.findMany({ where: { staff_id: { in: staffIds } } })
        : [],
      staffIds.length > 0
        ? prisma.posTransaction.groupBy({
            by: ['staff_id'],
            where: { staff_id: { in: staffIds }, created_at: { gte: monthStart } },
            _count: { id: true },
          })
        : [],
      allStaffIds.length > 0
        ? prisma.collectorShift.findMany({
            where: { staff_id: { in: allStaffIds }, shift_date: { gte: monthStart } },
          })
        : [],
      allStaffIds.length > 0
        ? prisma.operatorShift.findMany({
            where: { staff_id: { in: allStaffIds }, shift_date: { gte: monthStart } },
          })
        : [],
    ])

    const walletMap = new Map(allWallets.map(w => [w.staff_id, w]))
    const payCountMap = new Map(paymentCounts.map((p: any) => [p.staff_id, p._count.id]))
    const collShiftMap = new Map<string, typeof collectorShiftsAll>()
    for (const sh of collectorShiftsAll) {
      const arr = collShiftMap.get(sh.staff_id) ?? []
      arr.push(sh)
      collShiftMap.set(sh.staff_id, arr)
    }
    const opShiftMap = new Map<string, typeof operatorShiftsAll>()
    for (const sh of operatorShiftsAll) {
      const arr = opShiftMap.get(sh.staff_id) ?? []
      arr.push(sh)
      opShiftMap.set(sh.staff_id, arr)
    }

    const collectorStats = staff.map(s => {
      const wallet = walletMap.get(s.id)
      const shifts = collShiftMap.get(s.id) ?? []
      return {
        id: s.id, name: s.name,
        collected: Number(wallet?.total_collected ?? 0),
        delivered: Number(wallet?.total_delivered ?? 0),
        balance: Number(wallet?.balance ?? 0),
        payment_count: payCountMap.get(s.id) ?? 0,
        late_days: shifts.filter(sh => (sh.late_minutes ?? 0) > 0).length,
      }
    })

    // ══════════════════════════════════════════
    //  BATCH 4: Attendance stats (batch — no N+1)
    // ══════════════════════════════════════════
    // Days since the cycle started — replaces the old "day of month"
    // so attendance reports reset with each generation, not each
    // calendar month boundary.
    const workingDays = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)))
    const attendanceStats = allStaff.map(s => {
      const shifts = s.role === 'collector'
        ? (collShiftMap.get(s.id) ?? [])
        : (opShiftMap.get(s.id) ?? [])
      const present = shifts.filter(sh => sh.check_in_at !== null).length
      const totalLateMin = shifts.reduce((sum, sh) => sum + ((sh as any).late_minutes ?? 0), 0)
      const lateDays = shifts.filter(sh => ((sh as any).late_minutes ?? 0) > 0).length
      return {
        id: s.id, name: s.name, role: s.role,
        present, absent: workingDays - present,
        avg_late: lateDays > 0 ? Math.round(totalLateMin / lateDays) : 0,
        total_late_min: totalLateMin,
      }
    })

    // ── Process expenses ──
    const expenseByCategory: Record<string, number> = {}
    let totalExpenses = 0
    for (const e of expensesThisMonth) {
      const cat = e.category || 'أخرى'
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount)
      totalExpenses += Number(e.amount)
    }

    // ── Process online payments ──
    const subIds = [...new Set(onlinePayments.filter(p => p.subscriber_id).map(p => p.subscriber_id!))]
    const subNames = subIds.length > 0
      ? await prisma.subscriber.findMany({ where: { id: { in: subIds } }, select: { id: true, name: true } })
      : []
    const subNameMap = new Map(subNames.map(s => [s.id, s.name]))
    const onlineList = onlinePayments.map(p => ({
      id: p.id, date: p.created_at,
      subscriber_name: p.subscriber_id ? subNameMap.get(p.subscriber_id) ?? '—' : '—',
      amount: Number(p.amount), status: p.status, tran_ref: p.gateway_ref ?? '—',
    }))
    const successPayments = onlinePayments.filter(p => p.status === 'success')

    // ── NEW: IoT enrichments ──
    const [fuelTheftCount, overloadCount, voltageCriticalCount, fuelCostThisMonth] = await Promise.all([
      prisma.fuelEvent.count({
        where: { tenant_id: tenantId, type: 'theft_suspected', occurred_at: { gte: monthStart } },
      }),
      prisma.overloadEvent.count({
        where: { tenant_id: tenantId, detected_at: { gte: monthStart } },
      }),
      prisma.voltageEvent.count({
        where: {
          tenant_id: tenantId,
          type: { in: ['low_critical', 'high_critical'] },
          detected_at: { gte: monthStart },
        },
      }),
      prisma.fuelConsumption.aggregate({
        _sum: { cost_iqd: true },
        where: { tenant_id: tenantId, window_end: { gte: monthStart } },
      }),
    ])
    const cashRevenue = Number(cashThisMonth._sum.amount ?? 0)
    const fuelCost = Number(fuelCostThisMonth._sum.cost_iqd ?? 0)
    const netProfitThisMonth = cashRevenue - fuelCost - totalExpenses

    return NextResponse.json({
      financial: {
        monthly_revenue: monthlyRevenue,
        cash_this_month: Number(cashThisMonth._sum.amount ?? 0),
        online_this_month: Number(onlineThisMonth._sum.amount ?? 0),
        cash_last_month: Number(cashLastMonth._sum.amount ?? 0),
        online_last_month: Number(onlineLastMonth._sum.amount ?? 0),
        total_debt: Number(totalDebtAgg._sum.total_debt ?? 0),
        collection_rate: totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0,
        // NEW
        fuel_cost_this_month: fuelCost,
        net_profit_this_month: netProfitThisMonth,
      },
      iot_summary: {
        fuel_theft_incidents: fuelTheftCount,
        overload_incidents: overloadCount,
        voltage_critical_incidents: voltageCriticalCount,
      },
      subscribers: {
        total: totalActive, gold_count: goldCount, normal_count: normalCount,
        gold_amperage: Number(goldAmp._sum.amperage ?? 0),
        normal_amperage: Number(normalAmp._sum.amperage ?? 0),
        unpaid_count: unpaidSubs.length,
        unpaid_total: unpaidSubs.reduce((s, u) => s + Number(u.total_debt), 0),
        top_debtors: unpaidSubs.map(d => ({ name: d.name, debt: Number(d.total_debt) })),
      },
      collectors: collectorStats,
      expenses: { total: totalExpenses, by_category: expenseByCategory },
      attendance: attendanceStats,
      online_payments: {
        list: onlineList,
        total_success: successPayments.reduce((s, p) => s + Number(p.amount), 0),
        success_rate: onlinePayments.length > 0 ? Math.round((successPayments.length / onlinePayments.length) * 100) : 0,
      },
    })
  } catch (err: any) {
    console.error('[reports] Error:', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
