// GET /api/engines/[id]/readings?hours=24
//
// Returns time-series sensor data for charts: temperature, oil pressure,
// and load over the requested window. Capped at 500 points per series to
// protect the client. Tenant-scoped.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_POINTS = 500

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as { tenantId?: string }
  const { id } = await params

  const hours = Math.max(1, Math.min(168, parseInt(req.nextUrl.searchParams.get('hours') ?? '24', 10)))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  // Verify engine belongs to this tenant.
  const engine = await prisma.engine.findUnique({
    where: { id },
    select: {
      generator: { select: { branch: { select: { tenant_id: true } } } },
    },
  })
  if (!engine) {
    return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
  }
  if (engine.generator.branch.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [temps, pressures, loads] = await Promise.all([
    prisma.temperatureLog.findMany({
      where: { engine_id: id, logged_at: { gte: since } },
      orderBy: { logged_at: 'asc' },
      take: MAX_POINTS,
      select: { logged_at: true, temp_celsius: true },
    }),
    prisma.oilPressureLog.findMany({
      where: { engine_id: id, logged_at: { gte: since } },
      orderBy: { logged_at: 'asc' },
      take: MAX_POINTS,
      select: { logged_at: true, pressure_bar: true },
    }),
    prisma.loadLog.findMany({
      where: { engine_id: id, logged_at: { gte: since } },
      orderBy: { logged_at: 'asc' },
      take: MAX_POINTS,
      select: { logged_at: true, load_ampere: true },
    }),
  ])

  return NextResponse.json({
    hours,
    since: since.toISOString(),
    temperature: temps.map((t) => ({ at: t.logged_at, value: Number(t.temp_celsius) })),
    oil_pressure: pressures.map((p) => ({ at: p.logged_at, value: Number(p.pressure_bar) })),
    load: loads.map((l) => ({ at: l.logged_at, value: Number(l.load_ampere) })),
  })
}
