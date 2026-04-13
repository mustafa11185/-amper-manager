import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildNotificationFilter } from '@/lib/notification-filter'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filter = await buildNotificationFilter(session.user as Record<string, unknown>)
  if (!filter || !filter.where) {
    return NextResponse.json({ notifications: [] })
  }

  const where = { ...filter.where } as Record<string, unknown>

  // Optional UI grouping filter — temp/fuel/hardware vs everything else.
  const typeFilter = req.nextUrl.searchParams.get('type')
  if (typeFilter && typeFilter !== 'all') {
    const andList = (where.AND as unknown[]) || []
    if (typeFilter === 'alert') {
      andList.push({ type: { in: ['temp_warning', 'temp_critical', 'fuel_warning', 'fuel_critical', 'device_offline'] } })
    } else if (typeFilter === 'warning') {
      andList.push({ type: { in: ['temp_warning', 'fuel_warning', 'oil_change_due'] } })
    } else if (typeFilter === 'info') {
      andList.push({ type: { notIn: ['temp_warning', 'temp_critical', 'fuel_warning', 'fuel_critical', 'device_offline', 'oil_change_due'] } })
    }
    where.AND = andList
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
    include: {
      branch: { select: { name: true } },
    },
  })

  return NextResponse.json({ notifications })
}
