import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Auth: require subscriber cookie OR subscriber_id in body
    const cookieStore = await cookies()
    const cookieSubId = cookieStore.get('subscriber_id')?.value

    const body = await req.json()
    const subscriber_id = body.subscriber_id || cookieSubId
    const { rating, comment } = body

    if (!subscriber_id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'التقييم يجب أن يكون بين 1 و 5' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriber_id },
      select: { id: true, name: true, branch_id: true, tenant_id: true },
    })
    if (!subscriber) {
      return NextResponse.json({ error: 'مشترك غير موجود' }, { status: 404 })
    }

    // Store as a notification so the manager can see it
    await prisma.notification.create({
      data: {
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        type: 'subscriber_rating',
        title: 'تقييم خدمة',
        body: `${subscriber.name} قيّم الخدمة ${rating}/5${comment ? ' — ' + comment : ''}`,
        is_read: false,
        payload: {
          subscriber_id: subscriber.id,
          subscriber_name: subscriber.name,
          rating,
          comment: comment || null,
          rated_at: new Date().toISOString(),
        },
      },
    })

    return NextResponse.json({ ok: true, message: 'شكراً لتقييمك!' })
  } catch (err: any) {
    console.error('[rating] Error:', err?.message || err)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
