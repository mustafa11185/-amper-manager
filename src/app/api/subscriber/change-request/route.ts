import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscriber_id, current_amperage, requested_amperage, current_type, requested_type, notes } = body

    if (!subscriber_id) {
      return NextResponse.json({ error: 'subscriber_id مطلوب' }, { status: 400 })
    }

    if (!requested_amperage && !requested_type) {
      return NextResponse.json({ error: 'يرجى تحديد التغيير المطلوب' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriber_id },
      select: {
        id: true, name: true, branch_id: true, tenant_id: true,
        amperage: true, subscription_type: true,
      },
    })
    if (!subscriber) {
      return NextResponse.json({ error: 'مشترك غير موجود' }, { status: 404 })
    }

    // Prevent spam
    const pending = await prisma.upgradeRequest.findFirst({
      where: {
        subscriber_id: subscriber.id,
        status: 'pending',
      },
    })

    if (pending) {
      return NextResponse.json({
        ok: true,
        message: 'لديك طلب تغيير قيد المراجعة — سيتواصل معك المدير قريباً',
      })
    }

    // Create upgrade request
    await prisma.upgradeRequest.create({
      data: {
        subscriber_id: subscriber.id,
        branch_id: subscriber.branch_id,
        from_type: current_type || subscriber.subscription_type,
        to_type: requested_type || subscriber.subscription_type,
        requested_by: 'subscriber',
        status: 'pending',
      },
    })

    // Notification for manager
    const curAmp = current_amperage || Number(subscriber.amperage)
    const newAmp = requested_amperage || curAmp
    const typeLabel = requested_type === 'gold' ? 'ذهبي' : requested_type === 'normal' ? 'عادي' : ''

    await prisma.notification.create({
      data: {
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        type: 'change_request',
        title: 'طلب تغيير اشتراك',
        body: `${subscriber.name} يطلب تغيير: ${curAmp}A ${subscriber.subscription_type} → ${newAmp}A ${typeLabel}${notes ? ' — ' + notes : ''}`,
        is_read: false,
        payload: {
          subscriber_id: subscriber.id,
          subscriber_name: subscriber.name,
          current_amperage: curAmp,
          requested_amperage: newAmp,
          current_type: subscriber.subscription_type,
          requested_type: requested_type || subscriber.subscription_type,
          notes: notes || null,
        },
      },
    })

    return NextResponse.json({ ok: true, message: 'تم إرسال طلبك — سيتواصل معك المدير قريباً' })
  } catch (err: any) {
    console.error('[change-request] Error:', err?.message || err)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
