import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const subscriberId = cookieStore.get('subscriber_id')?.value
    if (!subscriberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      select: { tenant_id: true, subscription_type: true },
    })
    if (!subscriber) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const announcements = await prisma.$queryRaw`
      SELECT id, type, message, target, is_urgent, created_at
      FROM announcements
      WHERE tenant_id = ${subscriber.tenant_id}
      AND (
        subscriber_id = ${subscriberId}
        OR (
          subscriber_id IS NULL
          AND (target = 'all' OR target = ${subscriber.subscription_type})
        )
      )
      ORDER BY created_at DESC
      LIMIT 20
    ` as any[]

    return NextResponse.json({ announcements })
  } catch (err: any) {
    console.error('[announcements] Error:', err)
    return NextResponse.json({ error: 'خطأ' }, { status: 500 })
  }
}
