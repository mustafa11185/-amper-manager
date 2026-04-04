import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushNotification, pushTemplates } from '@/lib/push'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'owner' && (session.user as any).role !== 'manager') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params

  try {
    const request = await prisma.collectorDiscountRequest.findUnique({
      where: { id },
      include: { subscriber: { select: { name: true } }, staff: { select: { name: true } } },
    })
    if (!request) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'الطلب معالج مسبقاً' }, { status: 400 })
    }

    const updated = await prisma.collectorDiscountRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        decided_by: (session.user as any).id || session.user.name,
        decided_at: new Date(),
      },
    })

    // If payment was already made with this discount, add discount amount to debt
    const discountAmount = Number(request.amount)
    if (discountAmount > 0) {
      await prisma.subscriber.update({
        where: { id: request.subscriber_id },
        data: { total_debt: { increment: discountAmount } },
      })

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenant_id: request.tenant_id,
          branch_id: request.branch_id,
          actor_id: (session.user as any).id,
          actor_type: 'owner',
          action: 'discount_rejected_added_to_debt',
          entity_type: 'subscriber',
          entity_id: request.subscriber_id,
          new_value: { discount_amount: discountAmount, subscriber_name: request.subscriber.name },
        },
      })
    }

    // Notify the collector that the discount was rejected
    await prisma.notification.create({
      data: {
        branch_id: request.branch_id,
        tenant_id: request.tenant_id,
        type: 'discount_rejected',
        title: 'تم رفض الخصم ❌',
        body: `❌ تم رفض الخصم — ${Number(request.amount).toLocaleString()} د.ع أُضيفت لدين ${request.subscriber.name}`,
        payload: { staff_id: request.staff_id, subscriber_id: request.subscriber_id, request_id: id },
      },
    })

    // Push notification
    const push = pushTemplates.discountRejected()
    sendPushNotification({ staff_id: request.staff_id, ...push }).catch(() => {})

    return NextResponse.json({ request: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
