import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const IDLE_MINUTES = 30

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = (session.user as any).tenantId as string

  try {
    // Staff whose latest gps log is > 30 min old but they were active in last 8h
    const idleStaff = await prisma.$queryRaw<Array<any>>`
      SELECT DISTINCT ON (s.id)
        s.id, s.name, s.phone,
        g.lat, g.lng, g.recorded_at,
        EXTRACT(EPOCH FROM (NOW() - g.recorded_at)) / 60 as idle_minutes
      FROM staff s
      JOIN staff_gps_logs g ON g.staff_id = s.id
      WHERE s.tenant_id = ${tenantId}
        AND s.is_active = true
        AND g.recorded_at > NOW() - INTERVAL '8 hours'
      ORDER BY s.id, g.recorded_at DESC
    `

    const alerts = idleStaff.filter((s: any) => Number(s.idle_minutes ?? 0) >= IDLE_MINUTES)

    return NextResponse.json({ alerts, idle_threshold_minutes: IDLE_MINUTES })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
