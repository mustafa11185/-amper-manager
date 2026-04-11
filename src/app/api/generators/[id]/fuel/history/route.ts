// GET /api/generators/[id]/fuel/history?limit=50
//
// Returns the most recent fuel events for a generator (refills,
// manual deductions, IoT readings, theft alerts) plus the current
// state of the tank.
//
// Owner / accountant / operator (with can_view_iot) only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const { id } = await params

  try {
    const generator = await prisma.generator.findUnique({
      where: { id },
      include: { branch: { select: { tenant_id: true } } },
    })
    if (!generator) return NextResponse.json({ error: 'generator_not_found' }, { status: 404 })
    if (generator.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))

    // Backward-compat: pre-upgrade FuelLog rows have engine_id only
    // (no generator_id). We pull both shapes so the user's history
    // doesn't suddenly look empty after the schema migration.
    const engineIds = await prisma.engine.findMany({
      where: { generator_id: id },
      select: { id: true },
    }).then((rows) => rows.map((r) => r.id))

    const logs = await prisma.fuelLog.findMany({
      where: {
        OR: [
          { generator_id: id },
          ...(engineIds.length > 0 ? [{ engine_id: { in: engineIds } }] : []),
        ],
      },
      orderBy: { logged_at: 'desc' },
      take: limit,
    })

    const tankCap = generator.tank_capacity_liters ?? 0
    const pct = generator.fuel_level_pct ?? 0
    const currentLiters = tankCap > 0 ? (pct * tankCap / 100) : 0

    return NextResponse.json({
      generator: {
        id: generator.id,
        name: generator.name,
        tank_capacity_liters: tankCap,
        fuel_level_pct: pct,
        current_liters: currentLiters,
        last_fuel_update: generator.last_fuel_update?.toISOString() ?? null,
      },
      events: logs.map((l) => ({
        id: l.id,
        event_type: l.event_type,
        source: l.source,
        staff_id: l.staff_id,
        liters_change: l.fuel_added_liters,
        liters_after: l.liters_after,
        cost_iqd: l.cost_iqd != null ? Number(l.cost_iqd) : null,
        unit_price_iqd: l.unit_price_iqd != null ? Number(l.unit_price_iqd) : null,
        notes: l.notes,
        logged_at: l.logged_at.toISOString(),
      })),
    })
  } catch (err: any) {
    console.error('[fuel/history]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
