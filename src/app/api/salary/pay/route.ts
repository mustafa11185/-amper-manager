import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const { staff_id, amount, month, year, paid_from_delivery, delivery_id, notes } = await req.json()

    if (!staff_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // Always scope to the caller's tenant — without this, an
    // accountant/owner on tenant A could pay salary to a staff row
    // on tenant B by guessing their UUID.
    const staff = await prisma.staff.findFirst({
      where: { id: staff_id, tenant_id: user.tenantId },
      select: { branch_id: true, tenant_id: true, name: true },
    })
    if (!staff) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })

    // Default month/year = current cycle's billing period (not calendar)
    let defaultMonth: number
    let defaultYear: number
    if (staff.branch_id) {
      const cycle = await getCurrentCycleWindow(staff.branch_id)
      defaultMonth = cycle.month
      defaultYear = cycle.year
    } else {
      const now = new Date()
      defaultMonth = now.getMonth() + 1
      defaultYear = now.getFullYear()
    }

    const payment = await prisma.salaryPayment.create({
      data: {
        staff_id,
        tenant_id: staff.tenant_id,
        branch_id: staff.branch_id,
        month: month || defaultMonth,
        year: year || defaultYear,
        amount,
        payment_type: 'salary',
        paid_from_delivery: paid_from_delivery || false,
        delivery_id: delivery_id || null,
        notes: notes || null,
      },
    })

    // Notification
    try {
      await prisma.notification.create({
        data: {
          branch_id: staff.branch_id, tenant_id: staff.tenant_id,
          type: 'salary_paid',
          title: 'راتب مدفوع 💰',
          body: `تم دفع راتب ${staff.name}: ${Number(amount).toLocaleString()} د.ع`,
          payload: { staff_id, staff_name: staff.name, amount },
        },
      })
    } catch (_) {}

    return NextResponse.json({ ok: true, payment_id: payment.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
