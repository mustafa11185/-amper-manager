import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildNotificationFilter } from '@/lib/notification-filter'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filter = await buildNotificationFilter(session.user as Record<string, unknown>)
  if (!filter || !filter.where) {
    return NextResponse.json({ count: 0 })
  }

  // The same shape used by the list endpoint — count only what the
  // user can actually see. Without this the badge showed phantom
  // unread items the list never returned.
  const where = { ...filter.where, is_read: false } as Record<string, unknown>

  const count = await prisma.notification.count({ where })

  return NextResponse.json({ count })
}
