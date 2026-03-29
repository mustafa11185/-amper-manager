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
    // Get current location (latest log)
    const latest = await prisma.staffGpsLog.findFirst({
      where: { staff_id: staffId },
      orderBy: { recorded_at: 'desc' },
    })

    // Get stops (4+ minutes) for this day
    const stops = await prisma.staffGpsLog.findMany({
      where: {
        staff_id: staffId,
        is_stop: true,
        stop_duration_min: { gte: 4 },
        recorded_at: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { recorded_at: 'asc' },
      select: {
        lat: true,
        lng: true,
        recorded_at: true,
        stop_duration_min: true,
      },
    })

    // Deduplicate stops that are within 50m of each other (keep the one with longest duration)
    const deduped: typeof stops = []
    for (const s of stops) {
      const existing = deduped.find(d => {
        const R = 6371000
        const toRad = (deg: number) => (deg * Math.PI) / 180
        const dLat = toRad(Number(s.lat) - Number(d.lat))
        const dLng = toRad(Number(s.lng) - Number(d.lng))
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(d.lat))) * Math.cos(toRad(Number(s.lat))) * Math.sin(dLng / 2) ** 2
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 50
      })
      if (existing) {
        if ((s.stop_duration_min ?? 0) > (existing.stop_duration_min ?? 0)) {
          const idx = deduped.indexOf(existing)
          deduped[idx] = s
        }
      } else {
        deduped.push(s)
      }
    }

    return NextResponse.json({
      current_location: latest ? {
        lat: Number(latest.lat),
        lng: Number(latest.lng),
        last_seen: latest.recorded_at.toISOString(),
      } : null,
      stops: deduped.map(s => ({
        lat: Number(s.lat),
        lng: Number(s.lng),
        started_at: s.recorded_at.toISOString(),
        duration_minutes: s.stop_duration_min ?? 0,
      })),
    })
  } catch (e) {
    console.error('[map/collector-stops]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
