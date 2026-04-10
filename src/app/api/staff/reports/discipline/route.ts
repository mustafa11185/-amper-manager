import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Personal discipline report — attendance, lateness, comparison
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = user.id as string
  const tenantId = user.tenantId as string

  const now = new Date()
  const month = parseInt(req.nextUrl.searchParams.get('month') ?? String(now.getMonth() + 1))
  const year = parseInt(req.nextUrl.searchParams.get('year') ?? String(now.getFullYear()))
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)

  // My shifts
  const isCollector = user.role === 'collector' || user.canCollect
  const shifts = isCollector
    ? await prisma.collectorShift.findMany({
        where: { staff_id: staffId, shift_date: { gte: periodStart, lte: periodEnd } },
      })
    : await prisma.operatorShift.findMany({
        where: { staff_id: staffId, shift_date: { gte: periodStart, lte: periodEnd } },
      })

  const present = shifts.filter(s => (s as any).check_in_at !== null).length
  const totalLate = shifts.reduce((sum, s) => sum + ((s as any).late_minutes ?? 0), 0)
  const lateDays = shifts.filter(s => ((s as any).late_minutes ?? 0) > 0).length
  const workingDays = Math.min(now.getDate(), 30)
  const absent = workingDays - present

  // Team comparison: average late minutes for the same role
  const teamShifts = isCollector
    ? await prisma.collectorShift.findMany({
        where: {
          staff: { tenant_id: tenantId, role: 'collector' },
          shift_date: { gte: periodStart, lte: periodEnd },
        },
      })
    : await prisma.operatorShift.findMany({
        where: {
          staff: { tenant_id: tenantId, role: 'operator' },
          shift_date: { gte: periodStart, lte: periodEnd },
        },
      })

  const teamLateTotal = teamShifts.reduce((s, sh) => s + ((sh as any).late_minutes ?? 0), 0)
  const teamAvgLate = teamShifts.length > 0 ? teamLateTotal / teamShifts.length : 0

  // Score (0-100): 100 = perfect, deductions for late + absent
  const score = Math.max(0, 100 - (lateDays * 3) - (absent * 5) - (totalLate / 60))

  return NextResponse.json({
    period: { month, year },
    summary: {
      working_days: workingDays,
      present,
      absent,
      attendance_pct: workingDays > 0 ? Math.round((present / workingDays) * 100) : 0,
      late_days: lateDays,
      total_late_minutes: totalLate,
      avg_late_minutes: lateDays > 0 ? Math.round(totalLate / lateDays) : 0,
      score: Math.round(score),
    },
    team_comparison: {
      team_avg_late_minutes: Math.round(teamAvgLate),
      better_than_team: totalLate / Math.max(1, present) < teamAvgLate,
    },
  })
}
