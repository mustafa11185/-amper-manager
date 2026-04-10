import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTenantAlert } from '@/lib/whatsapp-send'

// AI Monthly Report — auto-runs on day 25 of each month (called from /api/cron/run-all)
//
// CYCLE INTEGRATION:
// • Day 25: This cron fires → manager gets executive summary on WhatsApp
// • Day 25-30: Manager reviews, distributes partner profits, plans maintenance
// • End of month / Day 1: Manager manually generates new invoices (the pivot)
// • New cycle begins
//
// We compute CURRENT month (data is ~80% complete on day 25, that's by design —
// the manager wants to see the trend BEFORE the cycle closes).

export async function POST() {
  try {
    const now = new Date()
    // Compute CURRENT month (since we fire on day 25)
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = now  // up to "now"
    // Previous month for comparison
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    const tenants = await prisma.tenant.findMany({
      where: { is_active: true },
      select: { id: true, name: true, alerts_enabled: true },
    })

    let sent = 0
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

    for (const tenant of tenants) {
      const branches = await prisma.branch.findMany({
        where: { tenant_id: tenant.id },
        select: { id: true },
      })
      const branchIds = branches.map(b => b.id)
      if (branchIds.length === 0) continue

      // Compute key metrics for current month
      const [revenueAgg, fuelCostAgg, expenseAgg, prevRevenueAgg,
        fuelTheftAgg, overloadCount, partnersCount, hasPendingDistribution] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: { branch_id: { in: branchIds }, billing_month: month, billing_year: year },
        }),
        prisma.fuelConsumption.aggregate({
          _sum: { cost_iqd: true, liters_consumed: true, runtime_minutes: true },
          where: { tenant_id: tenant.id, window_end: { gte: periodStart, lte: periodEnd } },
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: { branch_id: { in: branchIds }, created_at: { gte: periodStart, lte: periodEnd } },
        }),
        prisma.invoice.aggregate({
          _sum: { amount_paid: true },
          where: {
            branch_id: { in: branchIds },
            billing_month: prevMonth,
            billing_year: prevYear,
          },
        }),
        // Fuel theft losses (estimated cost)
        prisma.fuelEvent.aggregate({
          _sum: { cost_est_iqd: true },
          _count: true,
          where: {
            tenant_id: tenant.id,
            type: 'theft_suspected',
            occurred_at: { gte: periodStart, lte: periodEnd },
          },
        }),
        prisma.overloadEvent.count({
          where: { tenant_id: tenant.id, detected_at: { gte: periodStart, lte: periodEnd } },
        }),
        prisma.partner.count({
          where: { tenant_id: tenant.id, is_active: true },
        }),
        // Has there been any distribution this month yet?
        prisma.profitDistribution.count({
          where: {
            tenant_id: tenant.id,
            period_month: month,
            period_year: year,
          },
        }),
      ])

      const revenue = Number(revenueAgg._sum.amount_paid ?? 0)
      const prevRevenue = Number(prevRevenueAgg._sum.amount_paid ?? 0)
      const fuelCost = Number(fuelCostAgg._sum.cost_iqd ?? 0)
      const liters = Number(fuelCostAgg._sum.liters_consumed ?? 0)
      const runtimeH = Number(fuelCostAgg._sum.runtime_minutes ?? 0) / 60
      const expenses = Number(expenseAgg._sum.amount ?? 0)
      const theftLoss = Number(fuelTheftAgg._sum.cost_est_iqd ?? 0)
      const theftCount = fuelTheftAgg._count
      // True profit subtracts theft losses
      const profit = revenue - fuelCost - expenses - theftLoss
      const growth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0
      const lph = runtimeH > 0 ? liters / runtimeH : 0

      // Build the WhatsApp message (executive summary)
      const arrow = growth >= 0 ? '↑' : '↓'
      const reportUrl = `${process.env.NEXTAUTH_URL ?? ''}/monthly-report/${tenant.id}?month=${month}&year=${year}`

      // Action items: things the manager should do BEFORE end of month
      const actions: string[] = []
      if (partnersCount > 0 && hasPendingDistribution === 0 && profit > 0) {
        actions.push(`👥 لم توزّع أرباح ${monthNames[month - 1]} على الشركاء بعد`)
      }
      if (theftLoss > 0) {
        actions.push(`🚨 خسارة من السرقة: ${theftLoss.toLocaleString('ar-IQ')} د.ع — راجع التفاصيل`)
      }
      if (overloadCount > 0) {
        actions.push(`⚡ ${overloadCount} حالة استهلاك مخالف — قد تكون هناك إيرادات ضائعة`)
      }

      const message = `📊 تقرير ${monthNames[month - 1]} ${year} — ${tenant.name}\n` +
        `(يوم 25 — ما زال ${30 - now.getDate()} أيام على نهاية الشهر)\n\n` +
        `💰 الربح الصافي: ${profit.toLocaleString('ar-IQ')} د.ع (${arrow} ${Math.abs(growth).toFixed(0)}%)\n` +
        `📈 الإيرادات: ${revenue.toLocaleString('ar-IQ')} د.ع\n` +
        `⛽ كلفة الوقود: ${fuelCost.toLocaleString('ar-IQ')} د.ع\n` +
        (theftLoss > 0 ? `🚨 خسارة سرقة: ${theftLoss.toLocaleString('ar-IQ')} د.ع\n` : '') +
        `⏱️ ساعات تشغيل: ${runtimeH.toFixed(0)}س (${lph.toFixed(2)} L/h)\n` +
        `🚨 حوادث IoT: ${theftCount} سرقة + ${overloadCount} استهلاك مخالف\n\n` +
        (actions.length > 0
          ? `📌 خطوات مقترحة قبل نهاية الشهر:\n${actions.map(a => `• ${a}`).join('\n')}\n\n`
          : '') +
        `📄 التقرير الكامل: ${reportUrl}`

      const success = await sendTenantAlert(tenant.id, message)
      if (success) sent++
    }

    return NextResponse.json({ ok: true, tenants_processed: tenants.length, sent })
  } catch (err: any) {
    console.error('[cron/monthly-report]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
