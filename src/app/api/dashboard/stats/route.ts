import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as any
  const tenantId = user.tenantId

  try {
    const branchId = user.branchId as string | undefined

    // Get branches for this tenant (owner sees all, staff sees own branch)
    const branchFilter = user.role === 'owner'
      ? { tenant_id: tenantId }
      : { id: branchId }

    const branches = await prisma.branch.findMany({
      where: branchFilter,
      select: { id: true },
    })
    const branchIds = branches.map(b => b.id)

    if (branchIds.length === 0) {
      return NextResponse.json({
        total_subscribers: 0, monthly_revenue: 0, monthly_total_due: 0,
        monthly_collected: 0, monthly_deliveries: 0, collection_rate: 0,
        total_debt: 0, unpaid_count: 0, generator: null,
        gold_hours_today: 0, normal_hours_today: 0,
        operators_present: 0, operators_total: 0,
        total_amperage: 0, gold_amperage: 0, normal_amperage: 0,
        is_owner_collector: false, pending_discount_requests: [],
        pending_upgrade_requests: 0, alerts: [],
        collector_wallets: [], total_wallet_balance: 0,
        top_debtors: [], gauges: { engine_id: null, branch_id: null, temperature: null, fuel: null, oil_pressure: null, load: null, runtime_hours: null },
      })
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get active billing month from pricing (with null safety)
    let billingMonth = now.getMonth() + 1
    let billingYear = now.getFullYear()
    try {
      const latestPricing = await prisma.monthlyPricing.findFirst({
        where: { branch_id: { in: branchIds } },
        orderBy: { effective_from: 'desc' },
      })
      if (latestPricing?.effective_from) {
        const eff = new Date(latestPricing.effective_from)
        billingMonth = eff.getMonth() + 1
        billingYear = eff.getFullYear()
      }
    } catch (e) {
      console.error('[dashboard] monthlyPricing query failed:', e)
    }

    // Month boundaries for delivery query
    const monthStart = new Date(billingYear, billingMonth - 1, 1)
    const monthEnd = new Date(billingYear, billingMonth, 1)

    // Run all queries in parallel with individual error handling
    const [
      totalSubscribers,
      monthlyRevenue,
      monthlyCollected,
      monthlyDeliveries,
      totalDebtAgg,
      unpaidCount,
      generators,
      normalCutToday,
      operatorShiftsToday,
      pendingDiscountRequests,
      pendingUpgradeRequests,
      alerts,
      totalAmperageAgg,
      goldAmperageAgg,
      normalAmperageAgg,
      ownerActingCollector,
      onlinePaymentsAgg,
      totalCollectedAgg,
    ] = await Promise.all([
      // 1. Total active subscribers
      prisma.subscriber.count({
        where: { branch_id: { in: branchIds }, is_active: true },
      }).catch(e => { console.error('[dashboard] subscriber count:', e); return 0 }),

      // 2. Monthly total due (total_amount_due for billing period)
      prisma.invoice.aggregate({
        _sum: { total_amount_due: true },
        where: {
          branch_id: { in: branchIds },
          billing_month: billingMonth,
          billing_year: billingYear,
        },
      }).catch(e => { console.error('[dashboard] monthlyTotalDue:', e); return { _sum: { total_amount_due: null } } }),

      // 3. Monthly collected (amount_paid)
      prisma.invoice.aggregate({
        _sum: { amount_paid: true },
        where: {
          branch_id: { in: branchIds },
          billing_month: billingMonth,
          billing_year: billingYear,
        },
      }).catch(e => { console.error('[dashboard] monthlyCollected:', e); return { _sum: { amount_paid: null } } }),

      // 4. Monthly deliveries (wallet handovers)
      prisma.deliveryRecord.aggregate({
        _sum: { amount: true },
        where: {
          branch_id: { in: branchIds },
          delivered_at: { gte: monthStart, lt: monthEnd },
        },
      }).catch(e => { console.error('[dashboard] monthlyDeliveries:', e); return { _sum: { amount: null } } }),

      // 5. Total debt
      prisma.subscriber.aggregate({
        _sum: { total_debt: true },
        where: { branch_id: { in: branchIds }, is_active: true },
      }).catch(e => { console.error('[dashboard] totalDebt:', e); return { _sum: { total_debt: null } } }),

      // 6. Unpaid subscribers
      (async () => {
        try {
          const paidThisMonth = await prisma.invoice.findMany({
            where: {
              branch_id: { in: branchIds },
              billing_month: billingMonth,
              billing_year: billingYear,
              is_fully_paid: true,
            },
            select: { subscriber_id: true },
            distinct: ['subscriber_id'],
          })
          const paidIds = paidThisMonth.map(i => i.subscriber_id)

          return prisma.subscriber.count({
            where: {
              branch_id: { in: branchIds },
              is_active: true,
              ...(paidIds.length > 0 ? { id: { notIn: paidIds } } : {}),
            },
          })
        } catch (e) {
          console.error('[dashboard] unpaidCount:', e)
          return 0
        }
      })(),

      // 7. Generators with engines
      prisma.generator.findMany({
        where: { branch_id: { in: branchIds } },
        include: {
          engines: {
            include: {
              temperature_logs: {
                orderBy: { logged_at: 'desc' },
                take: 1,
              },
            },
          },
        },
      }).catch(e => { console.error('[dashboard] generators:', e); return [] }),

      // 8. NormalCutLog today
      prisma.normalCutLog.findMany({
        where: {
          branch_id: { in: branchIds },
          cut_start: { gte: todayStart },
        },
      }).catch(e => { console.error('[dashboard] normalCutToday:', e); return [] }),

      // 9. Operator shifts today
      prisma.operatorShift.findMany({
        where: {
          branch_id: { in: branchIds },
          shift_date: todayStart,
        },
      }).catch(e => { console.error('[dashboard] operatorShifts:', e); return [] }),

      // 10. Collector discount requests
      prisma.collectorDiscountRequest.findMany({
        where: {
          branch_id: { in: branchIds },
          status: 'pending',
        },
        include: {
          subscriber: { select: { name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
      }).catch(e => { console.error('[dashboard] discountRequests:', e); return [] }),

      // 11. Upgrade requests
      prisma.upgradeRequest.findMany({
        where: {
          branch_id: { in: branchIds },
          status: 'pending',
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }).catch(e => { console.error('[dashboard] upgradeRequests:', e); return [] }),

      // 12. AI alerts
      prisma.notification.findMany({
        where: {
          branch_id: { in: branchIds },
          type: 'alert',
          is_read: false,
        },
        orderBy: { created_at: 'desc' },
        take: 3,
      }).catch(e => { console.error('[dashboard] alerts:', e); return [] }),

      // 13. Total amperage
      prisma.subscriber.aggregate({
        _sum: { amperage: true },
        where: { branch_id: { in: branchIds }, is_active: true },
      }).catch(e => { console.error('[dashboard] totalAmperage:', e); return { _sum: { amperage: null } } }),

      // 14. Gold amperage
      prisma.subscriber.aggregate({
        _sum: { amperage: true },
        where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'gold' },
      }).catch(e => { console.error('[dashboard] goldAmperage:', e); return { _sum: { amperage: null } } }),

      // 15. Normal amperage
      prisma.subscriber.aggregate({
        _sum: { amperage: true },
        where: { branch_id: { in: branchIds }, is_active: true, subscription_type: 'normal' },
      }).catch(e => { console.error('[dashboard] normalAmperage:', e); return { _sum: { amperage: null } } }),

      // 16. Owner-as-collector check
      prisma.staff.findFirst({
        where: { tenant_id: tenantId, is_owner_acting: true, role: 'collector', is_active: true },
        select: { id: true },
      }).catch(e => { console.error('[dashboard] ownerCollector:', e); return null }),

      // 17. Online payments (success) this month — for non-invoice direct payments
      prisma.onlinePayment.aggregate({
        _sum: { amount: true },
        where: {
          tenant_id: tenantId,
          status: 'success',
          invoice_id: null, // Only non-invoice payments (invoice ones are already in amount_paid)
          created_at: { gte: monthStart, lt: monthEnd },
        },
      }).catch(e => { console.error('[dashboard] onlinePayments:', e); return { _sum: { amount: null } } }),

      // 18. Total collected from collector wallets
      prisma.collectorWallet.aggregate({
        _sum: { total_collected: true },
        where: { branch_id: { in: branchIds } },
      }).catch(e => { console.error('[dashboard] totalCollected:', e); return { _sum: { total_collected: null } } }),
    ])

    // Process generators for stat cards — null safe
    const firstGen = Array.isArray(generators) && generators.length > 0 ? generators[0] : null
    const firstEngine = firstGen?.engines?.[0] ?? null
    const latestTemp = firstEngine?.temperature_logs?.[0]?.temp_celsius ?? null
    const firstEngineId = firstEngine?.id ?? null

    // Get gauge readings — null safe
    let latestOilPressure: { value: number; logged_at: string } | null = null
    let latestTempLog: { value: number; logged_at: string } | null = null
    let latestFuelLog: { value: number; logged_at: string } | null = null
    let latestLoadLog: { value: number; logged_at: string } | null = null

    if (firstEngineId) {
      try {
        const tempLog = await prisma.temperatureLog.findFirst({ where: { engine_id: firstEngineId }, orderBy: { logged_at: 'desc' } })
        if (tempLog) latestTempLog = { value: tempLog.temp_celsius ?? 0, logged_at: tempLog.logged_at?.toISOString() ?? '' }
      } catch (e) { console.error('[dashboard] tempLog:', e) }

      try {
        const fuelLog = await prisma.fuelLog.findFirst({ where: { engine_id: firstEngineId }, orderBy: { logged_at: 'desc' } })
        if (fuelLog) latestFuelLog = { value: fuelLog.fuel_level_percent ?? 0, logged_at: fuelLog.logged_at?.toISOString() ?? '' }
      } catch (e) { console.error('[dashboard] fuelLog:', e) }

      try {
        const oilLog = await prisma.oilPressureLog.findFirst({ where: { engine_id: firstEngineId }, orderBy: { logged_at: 'desc' } })
        if (oilLog) latestOilPressure = { value: Number(oilLog.pressure_bar ?? 0), logged_at: oilLog.logged_at?.toISOString() ?? '' }
      } catch (e) { console.error('[dashboard] oilLog:', e) }

      try {
        const loadLog = await prisma.loadLog.findFirst({ where: { engine_id: firstEngineId }, orderBy: { logged_at: 'desc' } })
        if (loadLog) latestLoadLog = { value: Number(loadLog.load_ampere ?? 0), logged_at: loadLog.logged_at?.toISOString() ?? '' }
      } catch (e) { console.error('[dashboard] loadLog:', e) }
    }

    // Process NormalCutLog — null safe
    let normalMinutesToday = 0
    if (Array.isArray(normalCutToday)) {
      for (const log of normalCutToday) {
        if (log.duration_min) {
          normalMinutesToday += log.duration_min
        }
      }
    }

    // Operator attendance — null safe
    const shiftsArray = Array.isArray(operatorShiftsToday) ? operatorShiftsToday : []
    const operatorsPresent = shiftsArray.filter(s => s.check_in_at !== null).length
    const operatorsTotal = shiftsArray.length

    // Arabic month names
    const ARABIC_MONTHS: Record<number, string> = {
      1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل',
      5: 'مايو', 6: 'يونيو', 7: 'تموز', 8: 'آب',
      9: 'أيلول', 10: 'تشرين الأول', 11: 'تشرين الثاني', 12: 'كانون الأول',
    }

    // Financial calculations — null safe
    const collected = Number(monthlyCollected?._sum?.amount_paid ?? 0)
    const onlineNonInvoice = Number(onlinePaymentsAgg?._sum?.amount ?? 0)
    const deliveries = Number(monthlyDeliveries?._sum?.amount ?? 0)
    const totalDue = Number(monthlyRevenue?._sum?.total_amount_due ?? 0)
    const revenue = collected + onlineNonInvoice // Revenue = actual payments (not theoretical dues)
    const totalCollected = Number(totalCollectedAgg?._sum?.total_collected ?? 0)

    // Collection rate — null safe
    let collectionRate = 0
    try {
      const totalInvoices = await prisma.invoice.count({ where: { branch_id: { in: branchIds }, billing_month: billingMonth, billing_year: billingYear } })
      const paidInvoices = await prisma.invoice.count({ where: { branch_id: { in: branchIds }, billing_month: billingMonth, billing_year: billingYear, is_fully_paid: true } })
      collectionRate = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0
    } catch (e) { console.error('[dashboard] collectionRate:', e) }

    // Get collector wallets — null safe
    let collectorWallets: any[] = []
    let walletStaff: any[] = []
    try {
      collectorWallets = await prisma.collectorWallet.findMany({
        where: { branch_id: { in: branchIds } },
      })
      const walletStaffIds = collectorWallets.map(w => w.staff_id)
      walletStaff = walletStaffIds.length > 0
        ? await prisma.staff.findMany({
            where: { id: { in: walletStaffIds } },
            select: { id: true, name: true, photo_url: true, is_owner_acting: true },
          })
        : []
    } catch (e) { console.error('[dashboard] wallets:', e) }
    const staffMap = new Map(walletStaff.map((s: any) => [s.id, s]))

    // Top 5 debtors — null safe
    let topDebtors: any[] = []
    try {
      topDebtors = await prisma.subscriber.findMany({
        where: { branch_id: { in: branchIds }, is_active: true, total_debt: { gt: 0 } },
        orderBy: { total_debt: 'desc' },
        take: 5,
        select: { id: true, name: true, total_debt: true },
      })
    } catch (e) { console.error('[dashboard] topDebtors:', e) }

    // Assemble discount requests — null safe
    const discountRequestsArray = Array.isArray(pendingDiscountRequests) ? pendingDiscountRequests : []
    const upgradeRequestsArray = Array.isArray(pendingUpgradeRequests) ? pendingUpgradeRequests : []
    const alertsArray = Array.isArray(alerts) ? alerts : []

    return NextResponse.json({
      total_subscribers: typeof totalSubscribers === 'number' ? totalSubscribers : 0,
      monthly_revenue: revenue,
      monthly_total_due: totalDue,
      monthly_collected: collected,
      monthly_deliveries: deliveries,
      online_revenue: onlineNonInvoice,
      total_collected: totalCollected,
      collection_rate: collectionRate,
      billing_month: billingMonth,
      billing_year: billingYear,
      billing_month_name: ARABIC_MONTHS[billingMonth] ?? '',
      total_debt: Number(totalDebtAgg?._sum?.total_debt ?? 0),
      unpaid_count: typeof unpaidCount === 'number' ? unpaidCount : 0,
      generator: firstGen ? {
        name: firstGen.name ?? '',
        run_status: firstGen.run_status ?? false,
        fuel_level_pct: firstGen.fuel_level_pct ?? null,
        last_fuel_update: firstGen.last_fuel_update ?? null,
        current_temp: latestTemp,
      } : null,
      gold_hours_today: 0,
      normal_hours_today: +(normalMinutesToday / 60).toFixed(1),
      operators_present: operatorsPresent,
      operators_total: operatorsTotal,
      total_amperage: Number(totalAmperageAgg?._sum?.amperage ?? 0),
      gold_amperage: Number(goldAmperageAgg?._sum?.amperage ?? 0),
      normal_amperage: Number(normalAmperageAgg?._sum?.amperage ?? 0),
      is_owner_collector: !!ownerActingCollector,
      pending_discount_requests: discountRequestsArray.map((d: any) => ({
        id: d.id ?? '',
        amount: Number(d.amount ?? 0),
        reason: d.reason ?? null,
        subscriber: { name: d.subscriber?.name ?? '' },
        staff: { name: d.staff?.name ?? '' },
      })),
      pending_upgrade_requests: upgradeRequestsArray.length,
      alerts: alertsArray.map((a: any) => ({
        id: a.id ?? '',
        title: a.title ?? null,
        body: a.body ?? '',
        created_at: a.created_at ?? '',
      })),
      collector_wallets: collectorWallets.map(w => {
        const s = staffMap.get(w.staff_id)
        return {
          id: w.id ?? '',
          staff_id: w.staff_id ?? '',
          staff_name: s?.name ?? null,
          staff_photo: s?.photo_url ?? null,
          is_owner: s?.is_owner_acting ?? false,
          balance: Number(w.balance ?? 0),
          total_delivered: Number(w.total_delivered ?? 0),
        }
      }),
      total_wallet_balance: collectorWallets.reduce((a, w) => a + Number(w.balance ?? 0), 0),
      top_debtors: topDebtors.map((d: any) => ({ id: d.id ?? '', name: d.name ?? '', debt: Number(d.total_debt ?? 0) })),
      gauges: {
        engine_id: firstEngineId,
        branch_id: branchIds[0] ?? null,
        temperature: latestTempLog,
        fuel: latestFuelLog ? { value: latestFuelLog.value, logged_at: latestFuelLog.logged_at } : (firstGen?.fuel_level_pct != null ? { value: firstGen.fuel_level_pct, logged_at: firstGen.last_fuel_update?.toISOString() ?? null } : null),
        oil_pressure: latestOilPressure,
        load: latestLoadLog,
        runtime_hours: firstEngine ? { current: Number(firstEngine.runtime_hours ?? 0), max: firstEngine.oil_change_hours ?? 250 } : null,
      },
    })
  } catch (error) {
    console.error('[dashboard] FATAL stats error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل بيانات لوحة التحكم' }, { status: 500 })
  }
}
