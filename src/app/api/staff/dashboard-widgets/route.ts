export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Powers all the new widgets on the staff dashboard in one round-trip:
//   • today's collection (cash/card/wallet split, total today vs yesterday)
//   • today's goal progress (% paid vs branch unpaid count)
//   • my kabinas (with unpaid counts so the collector knows where to go)
//   • leaderboard position among collectors this month
//   • smart next subscriber to visit (highest debt, oldest unpaid)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role === 'owner') {
    return NextResponse.json({ error: 'Staff only' }, { status: 403 })
  }
  const staffId = user.id as string
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined
  if (!branchId) return NextResponse.json({ error: 'No branch assigned' }, { status: 400 })

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // ─── 1. Today's collection (split by payment method) ───────
  let collection: any = { total_today: 0, total_yesterday: 0, by_method: {}, count_today: 0 }
  try {
    const [todayTxs, yesterdayTxs] = await Promise.all([
      prisma.posTransaction.findMany({
        where: { staff_id: staffId, status: 'success', created_at: { gte: todayStart, lt: tomorrowStart } },
        select: { amount: true, payment_method: true },
      }),
      prisma.posTransaction.aggregate({
        _sum: { amount: true },
        where: { staff_id: staffId, status: 'success', created_at: { gte: yesterdayStart, lt: todayStart } },
      }),
    ])

    const byMethod: Record<string, number> = {}
    for (const t of todayTxs) {
      const m = (t.payment_method || 'cash').toLowerCase()
      byMethod[m] = (byMethod[m] || 0) + Number(t.amount)
    }
    collection = {
      total_today: todayTxs.reduce((s, t) => s + Number(t.amount), 0),
      total_yesterday: Number(yesterdayTxs._sum.amount ?? 0),
      by_method: byMethod,
      count_today: todayTxs.length,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/collection]', err.message)
  }

  // ─── 2. Today's goal — progress vs branch unpaid for the cycle ──
  // Goal = unpaid subscribers in this branch for the active billing cycle.
  // Progress = how many of them have been paid today (by anyone in branch).
  let goal: any = { target: 0, done_today: 0, progress_pct: 0 }
  try {
    const latestPricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: branchId },
      orderBy: { effective_from: 'desc' },
    })
    let bMonth = now.getMonth() + 1
    let bYear = now.getFullYear()
    if (latestPricing) {
      const eff = new Date(latestPricing.effective_from)
      bMonth = eff.getMonth() + 1
      bYear = eff.getFullYear()
    }

    const [unpaidCount, paidTodayCount] = await Promise.all([
      prisma.invoice.count({
        where: {
          branch_id: branchId,
          billing_month: bMonth,
          billing_year: bYear,
          is_fully_paid: false,
        },
      }),
      prisma.posTransaction.count({
        where: {
          branch_id: branchId,
          status: 'success',
          created_at: { gte: todayStart, lt: tomorrowStart },
        },
      }),
    ])

    const target = unpaidCount + paidTodayCount  // approximation: cycle workload
    goal = {
      target,
      done_today: paidTodayCount,
      progress_pct: target > 0 ? Math.round((paidTodayCount / target) * 100) : 0,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/goal]', err.message)
  }

  // ─── 3. My kabinas (alleys in branch + unpaid counts) ──────
  let kabinas: any[] = []
  try {
    // Same paid-this-cycle logic as the manager widgets endpoint
    const latestPricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: branchId },
      orderBy: { effective_from: 'desc' },
    })
    let bMonth = now.getMonth() + 1
    let bYear = now.getFullYear()
    if (latestPricing) {
      const eff = new Date(latestPricing.effective_from)
      bMonth = eff.getMonth() + 1
      bYear = eff.getFullYear()
    }
    const paid = await prisma.invoice.findMany({
      where: { branch_id: branchId, billing_month: bMonth, billing_year: bYear, is_fully_paid: true },
      select: { subscriber_id: true },
      distinct: ['subscriber_id'],
    })
    const paidIds = new Set(paid.map(p => p.subscriber_id))

    const records = await prisma.alley.findMany({
      where: { branch_id: branchId, is_active: true },
      orderBy: { sort_order: 'asc' },
      include: {
        subscribers: { where: { is_active: true }, select: { id: true } },
      },
    })
    kabinas = records.map(a => {
      const total = a.subscribers.length
      const unpaid = a.subscribers.filter(s => !paidIds.has(s.id)).length
      return { id: a.id, name: a.name, total, unpaid }
    }).sort((a, b) => b.unpaid - a.unpaid)
  } catch (err: any) {
    console.warn('[staff-widgets/kabinas]', err.message)
  }

  // ─── 4. Leaderboard rank this month ────────────────────────
  let leaderboard: any = { rank: 0, total_collectors: 0, my_collected: 0 }
  try {
    const grouped = await prisma.posTransaction.groupBy({
      by: ['staff_id'],
      _sum: { amount: true },
      where: {
        tenant_id: tenantId,
        status: 'success',
        created_at: { gte: monthStart },
      },
    })
    const ranked = grouped
      .map(g => ({ staff_id: g.staff_id, total: Number(g._sum.amount ?? 0) }))
      .sort((a, b) => b.total - a.total)
    const myIdx = ranked.findIndex(r => r.staff_id === staffId)
    leaderboard = {
      rank: myIdx >= 0 ? myIdx + 1 : 0,
      total_collectors: ranked.length,
      my_collected: myIdx >= 0 ? ranked[myIdx].total : 0,
      top_collected: ranked[0]?.total ?? 0,
    }
  } catch (err: any) {
    console.warn('[staff-widgets/leaderboard]', err.message)
  }

  // ─── 5. Smart next subscriber suggestion ───────────────────
  // Highest debt + oldest unpaid invoice in this branch — the row most
  // likely to slip through the cracks if not visited soon.
  let nextSubscriber: any = null
  try {
    const candidates = await prisma.subscriber.findMany({
      where: {
        branch_id: branchId,
        is_active: true,
        total_debt: { gt: 0 },
      },
      orderBy: [{ total_debt: 'desc' }],
      take: 1,
      select: {
        id: true,
        name: true,
        serial_number: true,
        phone: true,
        total_debt: true,
        amperage: true,
        alley: true,
        alley_ref: { select: { name: true } },
      },
    })
    if (candidates.length > 0) {
      const c = candidates[0]
      nextSubscriber = {
        id: c.id,
        name: c.name,
        serial_number: c.serial_number,
        phone: c.phone,
        total_debt: Number(c.total_debt),
        amperage: Number(c.amperage),
        alley: (c as any).alley_ref?.name ?? c.alley ?? null,
      }
    }
  } catch (err: any) {
    console.warn('[staff-widgets/next]', err.message)
  }

  return NextResponse.json({
    collection,
    goal,
    kabinas,
    leaderboard,
    next_subscriber: nextSubscriber,
  })
}
