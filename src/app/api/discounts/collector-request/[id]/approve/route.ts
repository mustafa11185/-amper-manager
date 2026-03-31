import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushNotification, pushTemplates } from '@/lib/push'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params

  try {
    const request = await prisma.collectorDiscountRequest.findUnique({
      where: { id },
      include: { subscriber: { select: { name: true } }, staff: { select: { name: true } } },
    })
    if (!request) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    const updated = await prisma.collectorDiscountRequest.update({
      where: { id },
      data: {
        status: 'approved',
        decided_by: (session.user as any).id || session.user.name,
        decided_at: new Date(),
      },
    })

    // Notify the collector that the discount was approved
    await prisma.notification.create({
      data: {
        branch_id: request.branch_id,
        tenant_id: request.tenant_id,
        type: 'discount_approved',
        title: 'تمت الموافقة على الخصم ✅',
        body: `تمت الموافقة على خصم ${Number(request.amount).toLocaleString()} د.ع للمشترك ${request.subscriber.name}`,
        payload: { staff_id: request.staff_id, subscriber_id: request.subscriber_id, request_id: id },
      },
    })

    // Push notification
    const push = pushTemplates.discountApproved(Number(request.amount))
    sendPushNotification({ staff_id: request.staff_id, ...push }).catch(() => {})

    return NextResponse.json({ request: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
