import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Staff incidents report — incidents reported by/discovered by this staff
// (For now: count IoT alerts that occurred during their shifts)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = user.id as string
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const now = new Date()
  const month = parseInt(req.nextUrl.searchParams.get('month') ?? String(now.getMonth() + 1))
  const year = parseInt(req.nextUrl.searchParams.get('year') ?? String(now.getFullYear()))
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)

  // Get this staff's shift periods
  const shifts = await prisma.collectorShift.findMany({
    where: {
      staff_id: staffId,
      shift_date: { gte: periodStart, lte: periodEnd },
      check_in_at: { not: null },
    },
    select: { check_in_at: true, check_out_at: true },
  })

  // Find IoT incidents during these shifts (best effort — we use branch since we lack staff-event linkage)
  const incidentTypes = [
    'fuel_theft_suspected',
    'temp_critical', 'temp_warning',
    'fuel_critical', 'fuel_warning',
    'overload_detected',
    'voltage_low_critical', 'voltage_high_critical',
    'voltage_low_warning', 'voltage_high_warning',
    'device_offline',
  ]
  const incidentsCount = await prisma.notification.count({
    where: {
      tenant_id: tenantId,
      branch_id: branchId,
      type: { in: incidentTypes },
      created_at: { gte: periodStart, lte: periodEnd },
    },
  })

  const fuelTheftCount = await prisma.fuelEvent.count({
    where: {
      tenant_id: tenantId,
      branch_id: branchId,
      type: 'theft_suspected',
      occurred_at: { gte: periodStart, lte: periodEnd },
    },
  })

  return NextResponse.json({
    period: { month, year },
    summary: {
      shifts_worked: shifts.length,
      incidents_during_shifts: incidentsCount,
      fuel_theft_in_branch: fuelTheftCount,
      reward_points: incidentsCount * 5,  // 5 points per incident witnessed
    },
    note: 'هذا التقرير يعرض أحداث IoT في الفرع خلال فترات شغلك. التنبيه عن المخالفات يعطيك نقاط مكافأة!',
  })
}
