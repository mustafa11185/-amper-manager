export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Single round-trip endpoint that powers all the new manager dashboard
// widgets (kabinas overview, IoT live status, partnership earnings,
// plan renewal countdown, maintenance due). Each block is wrapped in
// its own try/catch so a failure in one widget never breaks the others.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = req.nextUrl.searchParams.get('branch_id') || (user.role !== 'owner' ? user.branchId : null)

  // Resolve branch scope: explicit branch_id query, or staff's own branch,
  // or all tenant branches (owner without selection).
  const branchScope = branchId
    ? { id: branchId }
    : { tenant_id: tenantId }
  const branches = await prisma.branch.findMany({ where: branchScope, select: { id: true } })
  const branchIds = branches.map(b => b.id)

  // ─── 1. Kabinas overview ────────────────────────────────────
  // Top kabinas by subscriber count + paid/unpaid breakdown for the
  // current billing month so the manager can see collection rate at a
  // glance per kabina.
  let kabinas: any[] = []
  try {
    // Active billing month derived from latest pricing
    const latestPricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: { in: branchIds } },
      orderBy: { effective_from: 'desc' },
    })
    const now = new Date()
    let bMonth = now.getMonth() + 1
    let bYear = now.getFullYear()
    if (latestPricing) {
      const eff = new Date(latestPricing.effective_from)
      bMonth = eff.getMonth() + 1
      bYear = eff.getFullYear()
    }

    // Subscribers paid this billing cycle
    const paid = await prisma.invoice.findMany({
      where: {
        branch_id: { in: branchIds },
        billing_month: bMonth,
        billing_year: bYear,
        is_fully_paid: true,
      },
      select: { subscriber_id: true },
      distinct: ['subscriber_id'],
    })
    const paidIds = new Set(paid.map(p => p.subscriber_id))

    const alleyRecords = await prisma.alley.findMany({
      where: { branch_id: { in: branchIds }, is_active: true },
      orderBy: { sort_order: 'asc' },
      include: {
        subscribers: {
          where: { is_active: true },
          select: { id: true },
        },
      },
    })

    kabinas = alleyRecords.map(a => {
      const total = a.subscribers.length
      const paidCount = a.subscribers.filter(s => paidIds.has(s.id)).length
      const unpaid = total - paidCount
      const collectionRate = total > 0 ? Math.round((paidCount / total) * 100) : 0
      return { id: a.id, name: a.name, total, paid: paidCount, unpaid, collection_rate: collectionRate }
    }).sort((a, b) => b.total - a.total)
  } catch (err: any) {
    console.warn('[widgets/kabinas]', err.message)
  }

  // ─── 2. IoT live status ─────────────────────────────────────
  // Latest telemetry per linked engine, with alert flags for the user
  // to see at a glance which engines need attention.
  let iot: any = { devices: [], total_devices: 0, alerting: 0 }
  try {
    const devices = await prisma.iotDevice.findMany({
      where: { tenant_id: tenantId, ...(branchIds.length && { branch_id: { in: branchIds } }) },
      include: {
        generator: { select: { id: true, name: true } },
        engines: { include: { engine: { select: { id: true, name: true } } } },
      },
      orderBy: { created_at: 'desc' },
      take: 6,
    })

    const enriched = await Promise.all(devices.map(async (d) => {
      const tele = await prisma.iotTelemetry.findFirst({
        where: { device_id: d.id },
        orderBy: { recorded_at: 'desc' },
      })
      // Alert when temperature is high, fuel is critically low, or
      // voltage is outside the safe band.
      const alerts: string[] = []
      if (tele) {
        if (tele.temperature_c != null && tele.temperature_c > 95) alerts.push('temperature')
        if (tele.fuel_pct != null && tele.fuel_pct < 15) alerts.push('fuel')
        if (tele.voltage_v != null && (tele.voltage_v < 200 || tele.voltage_v > 240)) alerts.push('voltage')
      }
      return {
        id: d.id,
        name: d.name ?? d.generator?.name ?? 'IoT',
        generator_name: d.generator?.name ?? null,
        is_online: d.last_seen ? (Date.now() - new Date(d.last_seen).getTime() < 5 * 60_000) : false,
        last_seen: d.last_seen,
        temperature_c: tele?.temperature_c ?? null,
        fuel_pct: tele?.fuel_pct ?? null,
        voltage_v: tele?.voltage_v ?? null,
        current_a: tele?.current_a ?? null,
        alerts,
      }
    }))

    iot = {
      devices: enriched,
      total_devices: enriched.length,
      alerting: enriched.filter(d => d.alerts.length > 0).length,
    }
  } catch (err: any) {
    console.warn('[widgets/iot]', err.message)
  }

  // ─── 3. Partnership earnings ───────────────────────────────
  // Show partners with their share % and the share of this month's
  // net profit they would receive (preview before distribution).
  let partnership: any = { has_partners: false, partners: [], net_profit_month: 0 }
  try {
    const partners = await prisma.partner.findMany({
      where: { tenant_id: tenantId, is_active: true },
      include: { shares: true },
    })

    if (partners.length > 0) {
      // Net profit = collected revenue this month − recorded expenses
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const collected = await prisma.invoice.aggregate({
        _sum: { amount_paid: true },
        where: {
          branch_id: { in: branchIds },
          updated_at: { gte: monthStart },
          is_fully_paid: true,
        },
      })
      const expenses = await prisma.expense.aggregate({
        _sum: { amount: true },
        where: { branch_id: { in: branchIds }, created_at: { gte: monthStart } },
      }).catch(() => ({ _sum: { amount: 0 } } as any))

      const revenue = Number(collected._sum.amount_paid ?? 0)
      const cost = Number(expenses._sum.amount ?? 0)
      const net = Math.max(0, revenue - cost)

      partnership = {
        has_partners: true,
        net_profit_month: net,
        revenue_month: revenue,
        cost_month: cost,
        partners: partners.map(p => {
          // Average share across all branches the partner participates in
          const totalPct = p.shares.reduce((acc, s) => acc + Number(s.percentage), 0)
          const avgPct = p.shares.length > 0 ? totalPct / p.shares.length : 0
          return {
            id: p.id,
            name: p.name,
            share_percent: avgPct,
            estimated_share: Math.round((net * avgPct) / 100),
          }
        }),
      }
    }
  } catch (err: any) {
    console.warn('[widgets/partners]', err.message)
  }

  // ─── 4. Plan renewal countdown ──────────────────────────────
  let renewal: any = { has_subscription: false }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, subscription_ends_at: true, is_trial: true, trial_ends_at: true },
    })
    if (tenant) {
      const expiry = tenant.is_trial ? tenant.trial_ends_at : tenant.subscription_ends_at
      if (expiry) {
        const daysLeft = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000)
        renewal = {
          has_subscription: true,
          plan: tenant.plan,
          is_trial: tenant.is_trial,
          expires_at: expiry,
          days_left: daysLeft,
        }
      }
    }
  } catch (err: any) {
    console.warn('[widgets/renewal]', err.message)
  }

  // ─── 5. Maintenance due ─────────────────────────────────────
  // Engines that are due for any maintenance task, or due within 50h.
  let maintenance: any = { due_count: 0, soon_count: 0, items: [] }
  try {
    const engines = await prisma.engine.findMany({
      where: { generator: { branch_id: { in: branchIds } } },
      include: {
        generator: { select: { name: true, branch: { select: { name: true } } } },
      },
    })

    const items = engines.map(e => {
      const totalH = Number(e.runtime_hours)
      const sinceOil = totalH - Number(e.hours_at_last_oil)
      const sinceFilter = totalH - Number(e.hours_at_last_filter)
      const sinceService = totalH - Number(e.hours_at_last_service)
      const oilDueIn = e.oil_change_hours - sinceOil
      const filterDueIn = e.air_filter_hours - sinceFilter
      const serviceDueIn = e.full_service_hours - sinceService
      const minDueIn = Math.min(oilDueIn, filterDueIn, serviceDueIn)
      const reasons: string[] = []
      if (oilDueIn <= 0) reasons.push('تغيير زيت')
      else if (oilDueIn <= 50) reasons.push(`زيت بعد ${oilDueIn}س`)
      if (filterDueIn <= 0) reasons.push('فلتر هواء')
      else if (filterDueIn <= 50) reasons.push(`فلتر بعد ${filterDueIn}س`)
      if (serviceDueIn <= 0) reasons.push('صيانة شاملة')
      else if (serviceDueIn <= 50) reasons.push(`صيانة بعد ${serviceDueIn}س`)
      return {
        engine_id: e.id,
        engine_name: e.name,
        generator_name: e.generator.name,
        branch_name: e.generator.branch.name,
        runtime_hours: totalH,
        is_due: minDueIn <= 0,
        is_due_soon: minDueIn > 0 && minDueIn <= 50,
        min_due_in_hours: minDueIn,
        reasons,
      }
    }).filter(i => i.is_due || i.is_due_soon)
      .sort((a, b) => a.min_due_in_hours - b.min_due_in_hours)
      .slice(0, 5)

    maintenance = {
      due_count: items.filter(i => i.is_due).length,
      soon_count: items.filter(i => i.is_due_soon).length,
      items,
    }
  } catch (err: any) {
    console.warn('[widgets/maintenance]', err.message)
  }

  return NextResponse.json({ kabinas, iot, partnership, renewal, maintenance })
}
