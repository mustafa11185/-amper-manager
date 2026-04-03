import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const { subscriber_id, amount, reason, invoice_id } = await req.json()

    if (!subscriber_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriber_id },
      select: { branch_id: true, tenant_id: true },
    })
    if (!subscriber) {
      return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })
    }

    // Expires in 30 minutes
    const expires_at = new Date(Date.now() + 30 * 60 * 1000)

    const request = await prisma.collectorDiscountRequest.create({
      data: {
        staff_id: user.id,
        subscriber_id,
        invoice_id: invoice_id || null,
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        amount,
        reason: reason || null,
        expires_at,
      },
    })

    // Notify owner about new discount request
    try {
      const sub = await prisma.subscriber.findUnique({ where: { id: subscriber_id }, select: { name: true } })
      await prisma.notification.create({
        data: {
          branch_id: subscriber.branch_id, tenant_id: subscriber.tenant_id,
          type: 'discount_request',
          title: 'طلب خصم جديد 🏷️',
          body: `${user.name || 'جابي'} يطلب خصم ${Number(amount).toLocaleString()} د.ع للمشترك ${sub?.name || ''}`,
          payload: { discount_request_id: request.id, staff_id: user.id, staff_name: user.name, subscriber_id, amount },
        },
      })
    } catch (_) {}

    return NextResponse.json({ request }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
