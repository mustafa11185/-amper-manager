import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const staff = await prisma.staff.findMany({
    where: { tenant_id: tenantId },
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
        can_collect: can_collect || role === 'collector',
        can_operate: can_operate || role === 'operator',
        is_active: true,
      },
    })

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
