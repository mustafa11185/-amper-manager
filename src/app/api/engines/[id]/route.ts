import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PUT /api/engines/[id]  Body: { name?, model?, oil_change_hours?, ... }
// Updates an engine. Owner-only and tenant-scoped via the parent generator.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه تعديل المحركات' }, { status: 403 })
  }
  const { id } = await params

  try {
    const body = await req.json()
    // Verify ownership through the generator → branch → tenant chain
    const existing = await prisma.engine.findUnique({
      where: { id },
      include: { generator: { include: { branch: { select: { tenant_id: true } } } } },
    })
    if (!existing) return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
    if (existing.generator.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const data: any = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.model !== undefined) data.model = body.model ? String(body.model).trim() : null
    if (body.oil_change_hours !== undefined) data.oil_change_hours = Number(body.oil_change_hours) || 250
    if (body.air_filter_hours !== undefined) data.air_filter_hours = Number(body.air_filter_hours) || 500
    if (body.full_service_hours !== undefined) data.full_service_hours = Number(body.full_service_hours) || 1000
    if (body.runtime_hours !== undefined) data.runtime_hours = Number(body.runtime_hours)
    // Days-based oil schedule per season — null clears the override.
    if (body.oil_summer_days !== undefined) {
      data.oil_summer_days = body.oil_summer_days == null ? null : Math.max(1, Math.min(60, Number(body.oil_summer_days)))
    }
    if (body.oil_winter_days !== undefined) {
      data.oil_winter_days = body.oil_winter_days == null ? null : Math.max(1, Math.min(60, Number(body.oil_winter_days)))
    }
    if (body.oil_normal_days !== undefined) {
      data.oil_normal_days = body.oil_normal_days == null ? null : Math.max(1, Math.min(60, Number(body.oil_normal_days)))
    }

    const engine = await prisma.engine.update({ where: { id }, data })
    return NextResponse.json({ engine })
  } catch (err: any) {
    console.error('[engines PUT]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}

// DELETE /api/engines/[id]
// Cascade-deletes the engine + its telemetry + sensor logs.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه حذف المحركات' }, { status: 403 })
  }
  const { id } = await params

  try {
    const existing = await prisma.engine.findUnique({
      where: { id },
      include: { generator: { include: { branch: { select: { tenant_id: true } } } } },
    })
    if (!existing) return NextResponse.json({ error: 'engine_not_found' }, { status: 404 })
    if (existing.generator.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Engine relations cascade-delete via Prisma onDelete: Cascade where set,
    // and we manually wipe the rest to be safe across schema variations.
    await prisma.$transaction(async (tx) => {
      await tx.iotDeviceEngine.deleteMany({ where: { engine_id: id } }).catch(() => {})
      await tx.iotTelemetry.deleteMany({ where: { engine_id: id } }).catch(() => {})
      await tx.engine.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[engines DELETE]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
