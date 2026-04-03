import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      collector_permission: true,
      operator_permission: true,
      branch: { select: { name: true } },
    },
  })

  if (!staff) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  return NextResponse.json({ staff })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()

    // Update staff fields
    const staffData: any = {}
    if (body.name !== undefined) staffData.name = body.name
    if (body.phone !== undefined) staffData.phone = body.phone
    if (body.pin !== undefined) staffData.pin = body.pin
    if (body.role !== undefined) staffData.role = body.role
    if (body.is_active !== undefined) staffData.is_active = body.is_active
    if (body.can_collect !== undefined) staffData.can_collect = body.can_collect
    if (body.can_operate !== undefined) staffData.can_operate = body.can_operate
    if (body.is_owner_acting !== undefined) staffData.is_owner_acting = body.is_owner_acting

    const staff = await prisma.staff.update({
      where: { id },
      data: staffData,
    })

    // Build collector permission from nested OR flat fields
    const cp = body.collector_permission ?? {}
    if (body.can_collect || body.geofence_radius_m !== undefined) {
      const collectorData: any = {
        ...(body.geofence_radius_m !== undefined && { geofence_radius_m: body.geofence_radius_m }),
        ...(body.daily_target !== undefined && { daily_target: body.daily_target }),
        ...(body.can_give_discount !== undefined && { can_give_discount: body.can_give_discount }),
        ...(body.discount_max_amount !== undefined && { discount_max_amount: body.discount_max_amount }),
        ...(body.discount_timeout_min !== undefined && { discount_timeout_min: body.discount_timeout_min }),
        ...(body.shift_start_time !== undefined && { shift_start_time: body.shift_start_time }),
        ...(body.shift_end_time !== undefined && { shift_end_time: body.shift_end_time }),
        ...cp,
      }
      if (Object.keys(collectorData).length > 0) {
        await prisma.collectorPermission.upsert({
          where: { staff_id: id },
          create: { staff_id: id, tenant_id: staff.tenant_id, ...collectorData },
          update: collectorData,
        })
      }
    }

    // Build operator permission from nested OR flat fields
    const op = body.operator_permission ?? {}
    if (body.can_operate || body.can_add_fuel !== undefined) {
      const operatorData: any = {
        ...(body.can_add_fuel !== undefined && { can_add_fuel: body.can_add_fuel }),
        ...(body.can_log_hours !== undefined && { can_log_hours: body.can_log_hours }),
        ...(body.can_manual_mode !== undefined && { can_manual_mode: body.can_manual_mode }),
        ...op,
      }
      if (Object.keys(operatorData).length > 0) {
        await prisma.operatorPermission.upsert({
          where: { staff_id: id },
          create: { staff_id: id, tenant_id: staff.tenant_id, ...operatorData },
          update: operatorData,
        })
      }
    }

    // Upsert salary config if monthly_amount provided
    if (body.monthly_amount !== undefined) {
      await prisma.staffSalaryConfig.upsert({
        where: { staff_id: id },
        create: {
          staff_id: id,
          tenant_id: staff.tenant_id,
          branch_id: staff.branch_id,
          monthly_amount: body.monthly_amount,
          notes: body.salary_notes || null,
        },
        update: {
          monthly_amount: body.monthly_amount,
          ...(body.salary_notes !== undefined && { notes: body.salary_notes }),
        },
      })
    }

    // Ensure CollectorWallet exists if can_collect
    if (body.can_collect) {
      await prisma.collectorWallet.upsert({
        where: { staff_id: id },
        create: { staff_id: id, branch_id: staff.branch_id, tenant_id: staff.tenant_id },
        update: {},
      })
    }

    const updated = await prisma.staff.findUnique({
      where: { id },
      include: { collector_permission: true, operator_permission: true },
    })

    return NextResponse.json({ staff: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط' }, { status: 403 })
  }

  const { id } = await params

  try {
    await prisma.staff.update({
      where: { id },
      data: { is_active: false },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
