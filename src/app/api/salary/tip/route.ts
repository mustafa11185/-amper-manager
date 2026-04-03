import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const { staff_id, amount, notes } = await req.json()

    if (!staff_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staff_id },
      select: { branch_id: true, tenant_id: true, name: true },
    })
    if (!staff) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })

    const now = new Date()
    const payment = await prisma.salaryPayment.create({
      data: {
        staff_id,
        tenant_id: staff.tenant_id,
        branch_id: staff.branch_id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        amount,
        payment_type: 'tip',
        tip_notes: notes || null,
        notes: `إكرامية من ${(user as any).name || 'المدير'}`,
      },
    })

    return NextResponse.json({ ok: true, payment_id: payment.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
