import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Iraq is UTC+3 with no DST → day window centred on Baghdad midnight. */
function getIraqDayWindow(dateParam: string | null) {
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000
  let baseIraq: Date
  if (dateParam && dateParam !== 'today') {
    baseIraq = new Date(dateParam)
  } else {
    baseIraq = new Date(Date.now() + IRAQ_OFFSET_MS)
  }
  const dayStart = new Date(
    Date.UTC(baseIraq.getUTCFullYear(), baseIraq.getUTCMonth(), baseIraq.getUTCDate()) -
      IRAQ_OFFSET_MS,
  )
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { dayStart, dayEnd }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { dayStart, dayEnd } = getIraqDayWindow(req.nextUrl.searchParams.get('date'))

  try {
    // Latest known position (for the "current" marker)
    const latest = await prisma.staffGpsLog.findFirst({
      where: { staff_id: staffId },
      orderBy: { recorded_at: 'desc' },
    })

    // ALL GPS points for today — used by Flutter to draw the polyline trail
    const allPoints = await prisma.staffGpsLog.findMany({
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

    const stops = allPoints.filter(p => p.is_stop && (p.stop_duration_min ?? 0) >= 4)

    // Deduplicate stops within 50m (keep the longest-duration one)
    const deduped: typeof stops = []
    for (const s of stops) {
      const existing = deduped.find(d => {
        const R = 6371000
        const toRad = (deg: number) => (deg * Math.PI) / 180
        const dLat = toRad(Number(s.lat) - Number(d.lat))
        const dLng = toRad(Number(s.lng) - Number(d.lng))
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(Number(d.lat))) * Math.cos(toRad(Number(s.lat))) * Math.sin(dLng / 2) ** 2
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
      current_location: latest
        ? {
            lat: Number(latest.lat),
            lng: Number(latest.lng),
            last_seen: latest.recorded_at.toISOString(),
          }
        : null,
      trail: allPoints.map(p => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        recorded_at: p.recorded_at.toISOString(),
        is_stop: p.is_stop,
      })),
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
