import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildNotificationFilter } from '@/lib/notification-filter'

export async function PUT() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filter = await buildNotificationFilter(session.user as Record<string, unknown>)
  if (!filter || !filter.where) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  // Only mark as read what the user can actually see. Previously the
  // staff endpoint marked every unread row in the branch — even types
  // the staff couldn't see — leading to a confusing "everything just
  // disappeared from the manager bell" effect when a collector tapped
  // mark-all-read.
  const where = { ...filter.where, is_read: false } as Record<string, unknown>

  const result = await prisma.notification.updateMany({
    where,
    data: { is_read: true },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
