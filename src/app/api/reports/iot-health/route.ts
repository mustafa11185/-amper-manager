import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// IoT health report — uptime % per device + offline incidents + firmware versions
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const devices = await prisma.iotDevice.findMany({
    where,
    include: { generator: { select: { name: true } } },
  })

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const enriched = await Promise.all(devices.map(async (d) => {
    // Telemetry count last 7d (expected: 1 per minute = 10080)
    const teleCount = await prisma.iotTelemetry.count({
      where: { device_id: d.id, recorded_at: { gte: since } },
    })
    const expected = 7 * 24 * 60
    const uptimePct = Math.min(100, (teleCount / expected) * 100)

    // Offline incidents (notifications)
    const offlineCount = await prisma.notification.count({
      where: {
        branch_id: d.branch_id ?? undefined,
        type: 'device_offline',
        created_at: { gte: since },
        payload: { path: ['device_id'], equals: d.id },
      },
    })

    return {
      id: d.id,
      name: d.name,
      generator_name: d.generator?.name,
      is_online: d.is_online,
      is_paired: d.paired_at !== null,
      firmware: d.firmware,
      last_seen: d.last_seen,
      last_heartbeat: d.last_heartbeat,
      telemetry_count_7d: teleCount,
      uptime_pct: Math.round(uptimePct),
      offline_incidents_7d: offlineCount,
    }
  }))

  // Firmware version distribution
  const fwDistribution: Record<string, number> = {}
  for (const d of devices) {
    const fw = d.firmware || 'غير معروف'
    fwDistribution[fw] = (fwDistribution[fw] || 0) + 1
  }

  return NextResponse.json({
    summary: {
      total_devices: devices.length,
      online_count: devices.filter(d => d.is_online).length,
      offline_count: devices.filter(d => !d.is_online && d.paired_at !== null).length,
      unpaired_count: devices.filter(d => !d.paired_at).length,
      avg_uptime_pct: enriched.length > 0
        ? Math.round(enriched.reduce((s, e) => s + e.uptime_pct, 0) / enriched.length)
        : 0,
    },
    firmware_distribution: fwDistribution,
    devices: enriched,
  })
}
