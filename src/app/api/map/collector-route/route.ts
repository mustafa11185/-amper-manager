import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staff_id')
  const dateStr = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const startOfDay = new Date(dateStr + 'T00:00:00')
  const endOfDay = new Date(dateStr + 'T23:59:59')

  try {
    const points = await prisma.$queryRaw<Array<any>>`
      SELECT lat, lng, recorded_at, source, is_stop, stop_duration_min, payment_id
      FROM staff_gps_logs
      WHERE staff_id = ${staffId}
        AND recorded_at BETWEEN ${startOfDay} AND ${endOfDay}
      ORDER BY recorded_at ASC
    `

    const payments = await prisma.$queryRaw<Array<any>>`
      SELECT
        i.id, i.amount_paid, i.billing_month, i.billing_year,
        s.name as subscriber_name,
        g.lat as pay_lat, g.lng as pay_lng,
        g.recorded_at as pay_time
      FROM invoices i
      JOIN subscribers s ON s.id = i.subscriber_id
      LEFT JOIN staff_gps_logs g ON g.payment_id = i.id
      WHERE i.collector_id = ${staffId}
        AND i.updated_at BETWEEN ${startOfDay} AND ${endOfDay}
        AND i.is_fully_paid = true
    `

    const totalStops = points.filter((p: any) => p.is_stop).length
    const distanceKm = calculateDistance(points)

    return NextResponse.json({
      date: dateStr,
      points,
      payments,
      stats: {
        total_points: points.length,
        total_stops: totalStops,
        total_payments: payments.length,
        distance_km: distanceKm,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function calculateDistance(points: any[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const lat1 = Number(points[i - 1].lat)
    const lng1 = Number(points[i - 1].lng)
    const lat2 = Number(points[i].lat)
    const lng2 = Number(points[i].lng)
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return Math.round(total * 10) / 10
}
