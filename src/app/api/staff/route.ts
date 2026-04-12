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

  const where: any = {
    tenant_id: tenantId,
    // Staff can only see staff in their own branch
    ...(user.role !== 'owner' && branchId ? { branch_id: branchId } : {}),
  }

  // Owner can filter by branch_id query param
  const qBranch = req.nextUrl.searchParams.get('branch_id')
  if (qBranch) where.branch_id = qBranch

  const staff = await prisma.staff.findMany({
    where,
    include: {
      collector_permission: true,
      operator_permission: true,
    },
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({ staff })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'غير مصرح — المالك فقط' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const body = await req.json()
    const { name, phone, role, pin, branch_id, generator_id, is_owner_acting, can_collect, can_operate } = body

    if (!name || !role || !branch_id) {
      return NextResponse.json({ error: 'الحقول المطلوبة: الاسم، الدور، الفرع' }, { status: 400 })
    }

    const staff = await prisma.staff.create({
      data: {
        tenant_id: tenantId,
        branch_id,
        generator_id: generator_id || null,
        name,
        phone: phone || null,
        role,
        pin: pin || null,
        is_owner_acting: is_owner_acting || false,
        can_collect: can_collect || role === 'collector' || role === 'kiosk',
        can_operate: can_operate || role === 'operator' || role === 'kiosk',
        is_active: true,
      },
    })

    // Kiosk gets both collector wallet + operator permissions so it
    // can run the POS AND manage fuel/oil from the same terminal.
    if (role === 'kiosk') {
      try {
        await prisma.collectorWallet.create({
          data: { staff_id: staff.id, branch_id, tenant_id: tenantId },
        })
        await prisma.operatorPermission.create({
          data: {
            staff_id: staff.id,
            tenant_id: tenantId,
            can_add_fuel: true,
            can_record_oil_change: true,
          },
        })
      } catch (e: any) {
        console.warn('[staff/kiosk] default permissions failed:', e.message)
      }
    }

    // Create default permissions
    if (role === 'collector') {
      await prisma.collectorPermission.create({
        data: { staff_id: staff.id, tenant_id: tenantId },
      })
      await prisma.collectorWallet.create({
        data: {
          staff_id: staff.id,
          branch_id,
          tenant_id: tenantId,
        },
      })
      // Dual-role: also create operator permissions
      if (can_operate) {
        await prisma.operatorPermission.create({
          data: { staff_id: staff.id, tenant_id: tenantId },
        })
      }
    } else if (role === 'operator') {
      await prisma.operatorPermission.create({
        data: { staff_id: staff.id, tenant_id: tenantId },
      })
    }

    // Create salary config if monthly_amount provided
    if (body.monthly_amount && Number(body.monthly_amount) > 0) {
      await prisma.staffSalaryConfig.create({
        data: {
          staff_id: staff.id,
          tenant_id: tenantId,
          branch_id,
          monthly_amount: body.monthly_amount,
          notes: body.salary_notes || null,
        },
      })
    }

    return NextResponse.json({ staff }, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'هذا الرقم مسجل مسبقاً' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
