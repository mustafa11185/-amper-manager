import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  try {
    // Get GPS logs (all events) for today
    const logs = await prisma.staffGpsLog.findMany({
      where: {
        staff_id: staffId,
        recorded_at: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { recorded_at: 'asc' },
      select: {
        lat: true, lng: true, recorded_at: true,
        source: true, is_stop: true, stop_duration_min: true,
        payment_id: true,
      },
    })

    // Get today's payments by this collector
    const payments = await prisma.posTransaction.findMany({
      where: {
        collector_id: staffId,
        created_at: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { created_at: 'asc' },
      select: {
        id: true, amount: true, created_at: true,
        subscriber: { select: { name: true } },
      },
    })

    // Get shift
    const shift = await prisma.collectorShift.findFirst({
      where: {
        staff_id: staffId,
        check_in_at: { gte: dayStart, lte: dayEnd },
      },
      select: { check_in_at: true, check_out_at: true },
    })

    // Build timeline
    const timeline: any[] = []

    if (shift?.check_in_at) {
      timeline.push({
        time: shift.check_in_at.toISOString(),
        event_type: 'checkin',
        label: 'بدء الجولة',
      })
    }

    for (const p of payments) {
      timeline.push({
        time: p.created_at.toISOString(),
        event_type: 'payment',
        label: `دفعة — ${p.subscriber?.name ?? '—'}`,
        amount: Number(p.amount),
      })
    }

    for (const l of logs) {
      if (l.is_stop && (l.stop_duration_min ?? 0) >= 4) {
        timeline.push({
          time: l.recorded_at.toISOString(),
          event_type: 'stop',
          label: `توقف ${l.stop_duration_min} دقيقة`,
          lat: Number(l.lat),
          lng: Number(l.lng),
          duration_minutes: l.stop_duration_min,
        })
      }
    }

    if (shift?.check_out_at) {
      timeline.push({
        time: shift.check_out_at.toISOString(),
        event_type: 'checkout',
        label: 'إنهاء الجولة',
      })
    }

    // Sort by time
    timeline.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime())

    // Stats
    const totalCollected = payments.reduce((s: number, p: any) => s + Number(p.amount), 0)

    return NextResponse.json({
      timeline,
      stats: {
        total_collected: totalCollected,
        payment_count: payments.length,
        stop_count: logs.filter(l => l.is_stop).length,
      },
    })
  } catch (e) {
    console.error('[map/collector-timeline]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
