import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const salary = await prisma.staffSalary.findUnique({ where: { staff_id: id } })
    return NextResponse.json({
      salary: salary ? {
        salary_type: salary.salary_type,
        fixed_amount: Number(salary.fixed_amount),
        commission_rate: Number(salary.commission_rate),
        effective_from: salary.effective_from,
      } : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { id } = await params

  try {
    const { salary_type, fixed_amount, commission_rate } = await req.json()

    const staff = await prisma.staff.findUnique({ where: { id }, select: { branch_id: true, tenant_id: true } })
    if (!staff) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })

    const salary = await prisma.staffSalary.upsert({
      where: { staff_id: id },
      create: {
        staff_id: id,
        tenant_id: staff.tenant_id,
        branch_id: staff.branch_id,
        salary_type: salary_type || 'fixed',
        fixed_amount: Number(fixed_amount) || 0,
        commission_rate: Number(commission_rate) || 0,
      },
      update: {
        salary_type: salary_type || 'fixed',
        fixed_amount: Number(fixed_amount) || 0,
        commission_rate: Number(commission_rate) || 0,
        effective_from: new Date(),
      },
    })

    return NextResponse.json({ ok: true, salary })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
