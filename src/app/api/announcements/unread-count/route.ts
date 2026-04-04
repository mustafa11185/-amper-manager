import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const subscriberId = cookieStore.get('subscriber_id')?.value
    if (!subscriberId) return NextResponse.json({ count: 0 })

    const subs = await prisma.$queryRaw`
      SELECT tenant_id, subscription_type
      FROM subscribers WHERE id = ${subscriberId} LIMIT 1
    ` as any[]
    if (!subs.length) return NextResponse.json({ count: 0 })
    const sub = subs[0]

    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM announcements a
      WHERE a.tenant_id = ${sub.tenant_id}
      AND (
        a.target = 'all'
        OR (a.target = 'gold'   AND ${sub.subscription_type}::text = 'gold')
        OR (a.target = 'normal' AND ${sub.subscription_type}::text = 'normal')
        OR a.subscriber_id = ${subscriberId}
      )
      AND a.id NOT IN (
        SELECT announcement_id FROM subscriber_reads
        WHERE subscriber_id = ${subscriberId}
      )
    ` as any[]

    return NextResponse.json({ count: result[0]?.count ?? 0 })
  } catch (_e) {
    return NextResponse.json({ count: 0 })
  }
}
