import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const dateParam = req.nextUrl.searchParams.get('date')
  const now = new Date()
  let dayStart: Date
  let dayEnd: Date

  if (dateParam && dateParam !== 'today') {
    dayStart = new Date(dateParam)
    dayStart.setHours(0, 0, 0, 0)
    dayEnd = new Date(dateParam)
    dayEnd.setHours(23, 59, 59, 999)
  } else {
    dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  }

  try {
    const logs = await prisma.staffGpsLog.findMany({
      where: {
        staff_id: staffId,
        recorded_at: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { recorded_at: 'asc' },
      select: {
        lat: true,
        lng: true,
        recorded_at: true,
        is_stop: true,
        stop_duration_min: true,
      },
    })

    return NextResponse.json({
      path: logs.map(l => ({
        lat: Number(l.lat),
        lng: Number(l.lng),
        logged_at: l.recorded_at.toISOString(),
        is_stop: l.is_stop,
        stop_minutes: l.stop_duration_min ?? 0,
      })),
    })
  } catch (e) {
    console.error('[map/collector-path]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
