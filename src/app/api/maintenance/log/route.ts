import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — record a completed maintenance + reset the counter
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const { engine_id, type, description, cost, performed_by } = await req.json()
    if (!engine_id || !type) {
      return NextResponse.json({ error: 'engine_id و type مطلوبان' }, { status: 400 })
    }

    const engine = await prisma.engine.findUnique({
      where: { id: engine_id },
      include: { generator: { select: { branch_id: true, branch: { select: { tenant_id: true } } } } },
    })
    if (!engine || engine.generator.branch.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    }

    const currentHours = engine.runtime_hours

    // Create the log
    const log = await prisma.maintenanceLog.create({
      data: {
        tenant_id: tenantId,
        engine_id,
        type,
        description: description || null,
        hours_at_service: currentHours,
        cost: cost ? Number(cost) : null,
        performed_by: performed_by || null,
      },
    })

    // Reset the appropriate counter
    const updateData: any = {}
    if (type === 'oil_change') {
      updateData.hours_at_last_oil = currentHours
      updateData.last_oil_change_at = new Date()
    } else if (type === 'air_filter') {
      updateData.hours_at_last_filter = currentHours
    } else if (type === 'full_service') {
      updateData.hours_at_last_service = currentHours
      // A full service implicitly resets the others too
      updateData.hours_at_last_oil = currentHours
      updateData.hours_at_last_filter = currentHours
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.engine.update({ where: { id: engine_id }, data: updateData })
    }

    return NextResponse.json({ log }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
