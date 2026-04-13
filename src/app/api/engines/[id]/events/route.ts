// GET /api/engines/[id]/events
//
// Unified recent-events feed for one engine: fuel anomalies (FuelEvent),
// voltage thresholds crossed (VoltageEvent), and overload incidents
// (OverloadEvent). Voltage and overload events live at the generator
// level, so we look them up via the engine's parent generator.
//
// Response: { events: [{ kind, type, detected_at, title, body, severity, raw }] }
// sorted by detected_at desc, limited to 50.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type UnifiedEvent = {
  kind: 'fuel' | 'voltage' | 'overload'
  type: string
  detected_at: Date
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  raw: Record<string, unknown>
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as { tenantId?: string }
  const { id } = await params

  const engine = await prisma.engine.findUnique({
    where: { id },
    select: {
      generator_id: true,
      generator: { select: { branch: { select: { tenant_id: true } } } },
    },
  })
  if (!engine) {
    return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
  }
  if (engine.generator.branch.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [fuels, voltages, overloads] = await Promise.all([
    prisma.fuelEvent.findMany({
      where: { generator_id: engine.generator_id, occurred_at: { gte: thirtyDaysAgo } },
      orderBy: { occurred_at: 'desc' },
      take: 30,
    }),
    prisma.voltageEvent.findMany({
      where: { generator_id: engine.generator_id, detected_at: { gte: thirtyDaysAgo } },
      orderBy: { detected_at: 'desc' },
      take: 30,
    }),
    prisma.overloadEvent.findMany({
      where: { generator_id: engine.generator_id, detected_at: { gte: thirtyDaysAgo } },
      orderBy: { detected_at: 'desc' },
      take: 30,
    }),
  ])

  const events: UnifiedEvent[] = []

  for (const f of fuels) {
    const sev: UnifiedEvent['severity'] =
      f.type === 'theft_suspected' || f.type === 'leak_suspected' ? 'critical' : 'info'
    const title =
      f.type === 'theft_suspected' ? '🚨 اشتباه سرقة وقود'
      : f.type === 'leak_suspected' ? '💧 اشتباه تسرّب وقود'
      : '⛽ تعبئة وقود'
    events.push({
      kind: 'fuel',
      type: f.type,
      detected_at: f.occurred_at,
      title,
      body: `من ${f.fuel_before.toFixed(0)}% إلى ${f.fuel_after.toFixed(0)}% (${f.delta_pct.toFixed(0)}%)` +
        (f.liters_est ? ` • ≈ ${f.liters_est.toFixed(0)} لتر` : ''),
      severity: sev,
      raw: f as unknown as Record<string, unknown>,
    })
  }

  for (const v of voltages) {
    const sev: UnifiedEvent['severity'] = v.type.includes('critical') ? 'critical' : 'warning'
    const label =
      v.type === 'low_critical' ? 'فولتية منخفضة حرجة'
      : v.type === 'low_warning' ? 'فولتية منخفضة'
      : v.type === 'high_critical' ? 'فولتية مرتفعة حرجة'
      : 'فولتية مرتفعة'
    events.push({
      kind: 'voltage',
      type: v.type,
      detected_at: v.detected_at,
      title: `⚡ ${label}`,
      body: `القراءة: ${v.voltage.toFixed(0)}V • الحد: ${v.threshold.toFixed(0)}V`,
      severity: sev,
      raw: v as unknown as Record<string, unknown>,
    })
  }

  for (const o of overloads) {
    const sev: UnifiedEvent['severity'] = o.excess_pct > 20 ? 'critical' : 'warning'
    events.push({
      kind: 'overload',
      type: 'overload',
      detected_at: o.detected_at,
      title: '📈 حمل زائد',
      body: `${o.measured_amps.toFixed(0)}A مقابل ${o.subscribed_amps.toFixed(0)}A مشترك • زيادة ${o.excess_pct.toFixed(0)}%`,
      severity: sev,
      raw: o as unknown as Record<string, unknown>,
    })
  }

  events.sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime())

  return NextResponse.json({ events: events.slice(0, 50) })
}
