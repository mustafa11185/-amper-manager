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
    if (body.can_send_announcements !== undefined) staffData.can_send_announcements = body.can_send_announcements
    if (body.can_send_urgent !== undefined) staffData.can_send_urgent = body.can_send_urgent
    if (body.can_view_phones !== undefined) staffData.can_view_phones = body.can_view_phones
    if (body.can_view_others_debt !== undefined) staffData.can_view_others_debt = body.can_view_others_debt
    if (body.can_view_wallet !== undefined) staffData.can_view_wallet = body.can_view_wallet
    if (body.can_view_salary !== undefined) staffData.can_view_salary = body.can_view_salary
    if (body.can_send_whatsapp !== undefined) staffData.can_send_whatsapp = body.can_send_whatsapp
    if (body.can_add_expenses !== undefined) staffData.can_add_expenses = body.can_add_expenses
    if (body.can_check_in !== undefined) staffData.can_check_in = body.can_check_in
    if (body.track_location !== undefined) staffData.track_location = body.track_location

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
    // Delete RESTRICT children first (CASCADE ones auto-delete)
    await prisma.$executeRawUnsafe(`DELETE FROM pos_transactions WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM collector_daily_reports WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM collector_shifts WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM operator_shifts WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM operator_schedules WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM staff_gps_logs WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM staff_devices WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM collector_discount_requests WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM salary_payments WHERE staff_id = '${id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM collector_wallets WHERE staff_id = '${id}'`);
    // Now delete staff (CASCADE handles permissions, branch_access, salary_config)
    await prisma.staff.delete({ where: { id } });
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Delete staff error:', err.message, err.code);
    return NextResponse.json({ error: err.message || 'خطأ', code: err.code }, { status: 500 })
  }
}
