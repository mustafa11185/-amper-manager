// POST /api/generators/[id]/fuel/refill
//
// Adds fuel to a generator's tank. Updates Generator.fuel_level_pct
// and writes a FuelLog row of type 'refill'.
//
// Permission rules:
//   • Owner / accountant → always allowed
//   • Operator           → requires can_add_fuel=true (existing field)
//   • Other              → denied
//
// Body:
//   {
//     liters:          number,        // amount added
//     unit_price_iqd?: number,        // optional cost per liter
//     notes?:          string
//   }
//
// Response: { ok, generator, log, new_level_pct }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Permission
    const isOwner = user.role === 'owner' || user.role === 'accountant'
    if (!isOwner) {
      if (user.role === 'collector') {
        return NextResponse.json({ error: 'لا تملك صلاحية إضافة وقود' }, { status: 403 })
      }
      const perm = await prisma.operatorPermission.findUnique({ where: { staff_id: user.id } })
      if (!perm || !perm.can_add_fuel) {
        return NextResponse.json({ error: 'لا تملك صلاحية إضافة وقود' }, { status: 403 })
      }
    }

    const body = await req.json().catch(() => ({}))
    const liters = Number(body.liters)
    if (!liters || liters <= 0) {
      return NextResponse.json({ error: 'كمية الوقود غير صالحة' }, { status: 400 })
    }
    const unitPrice = body.unit_price_iqd != null ? Number(body.unit_price_iqd) : null
    const notes = body.notes ? String(body.notes).trim() : null

    // Compute new level
    const tankCap = generator.tank_capacity_liters ?? 0
    const currentPct = generator.fuel_level_pct ?? 0
    const currentLiters = tankCap > 0 ? (currentPct * tankCap / 100) : 0
    const newLiters = Math.min(tankCap > 0 ? tankCap : (currentLiters + liters), currentLiters + liters)
    const newPct = tankCap > 0 ? (newLiters / tankCap) * 100 : currentPct
    const totalCost = unitPrice != null ? unitPrice * liters : null

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.generator.update({
        where: { id },
        data: {
          fuel_level_pct: newPct,
          last_fuel_update: new Date(),
        },
      })
      const log = await tx.fuelLog.create({
        data: {
          generator_id: id,
          event_type: 'refill',
          source: isOwner ? 'manual_owner' : 'manual_staff',
          staff_id: user.id,
          fuel_level_percent: newPct,
          fuel_added_liters: liters,
          liters_after: newLiters,
          cost_iqd: totalCost,
          unit_price_iqd: unitPrice,
          notes,
        },
      })
      return { updated, log }
    })

    return NextResponse.json({
      ok: true,
      generator: result.updated,
      log: result.log,
      new_level_pct: newPct,
      new_liters: newLiters,
    })
  } catch (err: any) {
    console.error('[fuel/refill]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
