import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const typeFilter = req.nextUrl.searchParams.get('type')
  if (typeFilter && typeFilter !== 'all') where.type = typeFilter

  const events = await prisma.voltageEvent.findMany({
    where,
    orderBy: { detected_at: 'desc' },
    take: 100,
  })

  // Attach generator names
  const genIds = [...new Set(events.map(e => e.generator_id))]
  const generators = await prisma.generator.findMany({
    where: { id: { in: genIds } },
    select: { id: true, name: true },
  })
  const genMap = new Map(generators.map(g => [g.id, g.name]))
  const enriched = events.map(e => ({ ...e, generator_name: genMap.get(e.generator_id) ?? '—' }))

  // 30-day stats
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [lowCount, highCount, criticalCount] = await Promise.all([
    prisma.voltageEvent.count({ where: { ...where, type: { in: ['low_warning', 'low_critical'] }, detected_at: { gte: monthAgo } } }),
    prisma.voltageEvent.count({ where: { ...where, type: { in: ['high_warning', 'high_critical'] }, detected_at: { gte: monthAgo } } }),
    prisma.voltageEvent.count({ where: { ...where, type: { in: ['low_critical', 'high_critical'] }, detected_at: { gte: monthAgo } } }),
  ])

  // Latest voltage reading per generator (from telemetry)
  const latestPerGen: Record<string, number> = {}
  if (user.role === 'owner') {
    const branches = await prisma.branch.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    })
    const allGens = await prisma.generator.findMany({
      where: { branch_id: { in: branches.map(b => b.id) } },
      select: { id: true, name: true, iot_devices: { select: { id: true } } },
    })
    for (const g of allGens) {
      if (g.iot_devices.length === 0) continue
      const t = await prisma.iotTelemetry.findFirst({
        where: { device_id: { in: g.iot_devices.map(d => d.id) }, voltage_v: { not: null } },
        orderBy: { recorded_at: 'desc' },
      })
      if (t?.voltage_v != null) latestPerGen[g.id] = t.voltage_v
    }
  }

  return NextResponse.json({
    events: enriched,
    stats: {
      low_count_30d: lowCount,
      high_count_30d: highCount,
      critical_count_30d: criticalCount,
    },
    latest_voltages: latestPerGen,
  })
}
