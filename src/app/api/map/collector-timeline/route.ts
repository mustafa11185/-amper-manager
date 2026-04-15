import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Iraq is UTC+3 with no DST → day window centred on Baghdad midnight. */
function getIraqDayWindow() {
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET_MS)
  const dayStart = new Date(
    Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) -
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

  const { dayStart, dayEnd } = getIraqDayWindow()

  try {
    // GPS logs for today
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

    // Today's collections — read from Invoice where this collector received payment.
    // (PosTransaction is a legacy/POS-device table and isn't populated by the
    // staff_flutter payment flow, which only stamps Invoice.collector_id.)
    const invoices = await prisma.invoice.findMany({
      where: {
        collector_id: staffId,
        updated_at: { gte: dayStart, lte: dayEnd },
        amount_paid: { gt: 0 },
      },
      orderBy: { updated_at: 'asc' },
      select: {
        id: true,
        amount_paid: true,
        updated_at: true,
        subscriber: { select: { name: true } },
      },
    })

    // Shift
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

    for (const inv of invoices) {
      timeline.push({
        time: inv.updated_at.toISOString(),
        event_type: 'payment',
        label: `دفعة — ${inv.subscriber?.name ?? '—'}`,
        amount: Number(inv.amount_paid),
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

    timeline.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime())

    const totalCollected = invoices.reduce((s: number, i: any) => s + Number(i.amount_paid), 0)

    return NextResponse.json({
      timeline,
      stats: {
        total_collected: totalCollected,
        payment_count: invoices.length,
        stop_count: logs.filter(l => l.is_stop).length,
      },
    })
  } catch (e) {
    console.error('[map/collector-timeline]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
