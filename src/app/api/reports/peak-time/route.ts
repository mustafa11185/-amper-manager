import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) return NextResponse.json({ by_day: [], by_hour: [] })

    const since = new Date()
    since.setDate(since.getDate() - 90)

    const txs = await prisma.posTransaction.findMany({
      where: {
        branch_id: { in: branchIds },
        status: 'success',
        created_at: { gte: since },
      },
      select: { created_at: true, amount: true },
    })

    const dayBuckets = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      name: DAY_NAMES_AR[i],
      count: 0,
      total: 0,
    }))
    const hourBuckets = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      count: 0,
      total: 0,
    }))

    for (const t of txs) {
      const d = new Date(t.created_at)
      const dow = d.getDay()
      const h = d.getHours()
      dayBuckets[dow].count += 1
      dayBuckets[dow].total += Number(t.amount)
      hourBuckets[h].count += 1
      hourBuckets[h].total += Number(t.amount)
    }

    const topDays = [...dayBuckets].sort((a, b) => b.count - a.count).slice(0, 3)
    const topHours = [...hourBuckets].sort((a, b) => b.count - a.count).slice(0, 3)

    return NextResponse.json({
      by_day: dayBuckets,
      by_hour: hourBuckets,
      top_days: topDays,
      top_hours: topHours,
      peak_day: topDays[0]?.name ?? '—',
      peak_hour: topHours[0]?.label ?? '—',
    })
  } catch (err: any) {
    console.error('[reports/peak-time]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
