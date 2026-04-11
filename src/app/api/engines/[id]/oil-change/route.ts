// POST /api/engines/[id]/oil-change
//
// Records an oil change for an engine. Updates the engine snapshot
// (last_oil_change_at + hours_at_last_oil) and writes a row to
// MaintenanceLog so the history report can include it.
//
// Permission rules:
//   • Owner / accountant → always allowed
//   • Operator           → requires can_record_oil_change=true
//   • Collector          → never allowed
//
// Body:
//   {
//     hours_at_change?: number,    // defaults to engine.runtime_hours
//     cost_iqd?:        number,    // optional cost paid for the oil
//     notes?:           string,
//     source?:          'manual_owner' | 'manual_staff' | 'iot_auto'
//   }
//
// Response: { engine, log, daysUntilNext }

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
    // Verify engine exists + tenant ownership
    const engine = await prisma.engine.findUnique({
      where: { id },
      include: { generator: { include: { branch: { select: { tenant_id: true } } } } },
    })
    if (!engine) return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
    if (engine.generator.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Permission check
    const isOwner = user.role === 'owner' || user.role === 'accountant'
    if (!isOwner) {
      if (user.role === 'collector') {
        return NextResponse.json({ error: 'لا تملك صلاحية تسجيل تغيير الدهن' }, { status: 403 })
      }
      // Operator — check explicit permission
      const perm = await prisma.operatorPermission.findUnique({ where: { staff_id: user.id } })
      if (!perm || !perm.can_record_oil_change) {
        return NextResponse.json({ error: 'لا تملك صلاحية تسجيل تغيير الدهن' }, { status: 403 })
      }
    }

    const body = await req.json().catch(() => ({}))
    const hoursAtChange = body.hours_at_change != null
      ? Number(body.hours_at_change)
      : Number(engine.runtime_hours)
    const cost = body.cost_iqd != null ? Number(body.cost_iqd) : null
    const notes = body.notes ? String(body.notes).trim() : null
    const source = (body.source as string) ?? (isOwner ? 'manual_owner' : 'manual_staff')

    const now = new Date()

    const result = await prisma.$transaction(async (tx) => {
      // Update engine snapshot
      const updated = await tx.engine.update({
        where: { id },
        data: {
          last_oil_change_at: now,
          hours_at_last_oil: hoursAtChange,
        },
      })

      // Append maintenance log
      const log = await tx.maintenanceLog.create({
        data: {
          tenant_id: user.tenantId,
          engine_id: id,
          type: 'oil_change',
          description: notes ?? `تغيير دهن (${source})`,
          hours_at_service: hoursAtChange,
          cost: cost,
          performed_by: user.name || user.id,
          performed_at: now,
        },
      })

      return { updated, log }
    })

    // Compute days until next using current season + per-engine override
    const month = now.getMonth() + 1
    let intervalDays: number
    if (month >= 6 && month <= 9) {
      intervalDays = engine.oil_summer_days ?? 15
    } else if (month === 12 || month <= 2) {
      intervalDays = engine.oil_winter_days ?? 25
    } else {
      intervalDays = engine.oil_normal_days ?? 20
    }

    return NextResponse.json({
      ok: true,
      engine: result.updated,
      log: result.log,
      next_due_in_days: intervalDays,
      season: month >= 6 && month <= 9 ? 'summer' : (month === 12 || month <= 2 ? 'winter' : 'normal'),
    })
  } catch (err: any) {
    console.error('[oil-change POST]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
