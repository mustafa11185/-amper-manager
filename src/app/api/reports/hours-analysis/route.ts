import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) return NextResponse.json({ staff: [] })

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const staff = await prisma.staff.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        branch_id: { in: branchIds },
        role: { in: ['collector', 'operator'] },
      },
      select: { id: true, name: true, role: true },
    })

    const result = await Promise.all(staff.map(async (s) => {
      const shifts = s.role === 'collector'
        ? await prisma.collectorShift.findMany({
            where: { staff_id: s.id, shift_date: { gte: monthStart } },
            select: { hours_worked: true, late_minutes: true, check_in_at: true },
          })
        : await prisma.operatorShift.findMany({
            where: { staff_id: s.id, shift_date: { gte: monthStart } },
            select: { hours_worked: true, check_in_at: true },
          })

      const presentShifts = shifts.filter(sh => sh.check_in_at !== null)
      const hours = presentShifts.reduce((s, sh) => s + Number(sh.hours_worked ?? 0), 0)
      const days = presentShifts.length
      const avg = days > 0 ? hours / days : 0
      const onTime = presentShifts.filter(sh => ((sh as any).late_minutes ?? 0) === 0).length
      const onTimePct = days > 0 ? Math.round((onTime / days) * 100) : 0

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        hours: Math.round(hours * 10) / 10,
        avg_per_day: Math.round(avg * 10) / 10,
        on_time_pct: onTimePct,
        days,
      }
    }))

    return NextResponse.json({ staff: result })
  } catch (err: any) {
    console.error('[reports/hours-analysis]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
