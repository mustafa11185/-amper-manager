import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public endpoint — authenticated by URL token only.
// Returns operational snapshot for a single branch (NO subscriber PII).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const kiosk = await prisma.kioskScreen.findUnique({ where: { token } })
  if (!kiosk || !kiosk.is_active) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  }

  // Touch last_seen
  await prisma.kioskScreen.update({
    where: { id: kiosk.id },
    data: {
      last_seen: new Date(),
      user_agent: req.headers.get('user-agent') || null,
    },
  })

  const branchId = kiosk.branch_id
  const tenantId = kiosk.tenant_id
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Branch info
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true },
  })

  // ── Counts (no subscriber names) ──
  const [
    totalSubs,
    activeSubs,
    todayRevenue,
    monthRevenue,
    unpaidCount,
    presentStaff,
    iotDevices,
    generators,
  ] = await Promise.all([
    prisma.subscriber.count({ where: { branch_id: branchId } }),
    prisma.subscriber.count({ where: { branch_id: branchId, is_active: true } }),
    prisma.invoice.aggregate({
      _sum: { amount_paid: true },
      where: { branch_id: branchId, updated_at: { gte: todayStart } },
    }),
    prisma.invoice.aggregate({
      _sum: { amount_paid: true },
      where: { branch_id: branchId, billing_month: now.getMonth() + 1, billing_year: now.getFullYear() },
    }),
    prisma.subscriber.count({
      where: { branch_id: branchId, is_active: true, total_debt: { gt: 0 } },
    }),
    prisma.collectorShift.count({
      where: {
        staff: { tenant_id: tenantId, branch_id: branchId },
        shift_date: { gte: todayStart },
        check_in_at: { not: null },
        check_out_at: null,
      },
    }),
    prisma.iotDevice.findMany({
      where: { tenant_id: tenantId, branch_id: branchId, is_active: true },
      include: {
        engines: { include: { engine: { select: { id: true, name: true } } } },
      },
    }),
    prisma.generator.findMany({
      where: { branch_id: branchId, is_active: true },
      select: { id: true, name: true, run_status: true, fuel_level_pct: true },
    }),
  ])

  // Latest telemetry per device
  const telemetry = await Promise.all(iotDevices.map(async (d) => {
    const t = await prisma.iotTelemetry.findFirst({
      where: { device_id: d.id },
      orderBy: { recorded_at: 'desc' },
    })
    return {
      device_id: d.id,
      name: d.name,
      is_online: d.is_online,
      last_seen: d.last_seen,
      engines: d.engines.map(e => ({ id: e.engine_id, name: e.engine.name })),
      latest: t,
    }
  }))

  // ── Recent alerts (no PII) ──
  const alerts = await prisma.notification.findMany({
    where: {
      branch_id: branchId,
      type: { in: ['temp_warning', 'temp_critical', 'fuel_warning', 'fuel_critical', 'device_offline'] },
      created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { id: true, type: true, title: true, body: true, created_at: true },
  })

  return NextResponse.json({
    kiosk: { id: kiosk.id, name: kiosk.name },
    branch: { id: branchId, name: branch?.name ?? '—' },
    timestamp: now.toISOString(),
    stats: {
      total_subs: totalSubs,
      active_subs: activeSubs,
      unpaid_count: unpaidCount,
      today_revenue: Number(todayRevenue._sum.amount_paid ?? 0),
      month_revenue: Number(monthRevenue._sum.amount_paid ?? 0),
      present_staff: presentStaff,
    },
    generators,
    iot: telemetry,
    alerts,
  })
}
