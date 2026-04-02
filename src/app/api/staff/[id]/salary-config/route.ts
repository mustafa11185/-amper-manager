import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const config = await prisma.staffSalaryConfig.findUnique({ where: { staff_id: id } })

    // Also get paid this month
    const now = new Date()
    let paidThisMonth = 0
    try {
      const payments = await prisma.salaryPayment.aggregate({
        _sum: { amount: true },
        where: { staff_id: id, month: now.getMonth() + 1, year: now.getFullYear() },
      })
      paidThisMonth = Number(payments._sum.amount ?? 0)
    } catch {}

    return NextResponse.json({
      monthly_amount: config ? Number(config.monthly_amount) : 0,
      notes: config?.notes ?? '',
      paid_this_month: paidThisMonth,
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
    const { monthly_amount, notes } = await req.json()
    const staff = await prisma.staff.findUnique({ where: { id }, select: { branch_id: true, tenant_id: true } })
    if (!staff) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })

    await prisma.staffSalaryConfig.upsert({
      where: { staff_id: id },
      create: { staff_id: id, tenant_id: staff.tenant_id, branch_id: staff.branch_id, monthly_amount: Number(monthly_amount) || 0, notes: notes || null },
      update: { monthly_amount: Number(monthly_amount) || 0, notes: notes || null },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
