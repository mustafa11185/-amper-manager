import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Lists all engines + their maintenance status (overdue / due soon / OK)
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const branches = await prisma.branch.findMany({
    where: user.role === 'owner' ? { tenant_id: tenantId } : { id: branchId },
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const engines = await prisma.engine.findMany({
    where: { generator: { branch_id: { in: branchIds } } },
    include: {
      generator: { select: { name: true, branch: { select: { name: true } } } },
      maintenance_logs: { orderBy: { performed_at: 'desc' }, take: 3 },
    },
  })

  const enriched = engines.map(e => {
    const totalH = Number(e.runtime_hours)
    const sinceOil = totalH - Number(e.hours_at_last_oil)
    const sinceFilter = totalH - Number(e.hours_at_last_filter)
    const sinceService = totalH - Number(e.hours_at_last_service)

    const items = [
      { type: 'oil_change', label: 'تغيير الزيت', since: sinceOil, interval: e.oil_change_hours },
      { type: 'air_filter', label: 'فلتر الهواء', since: sinceFilter, interval: e.air_filter_hours },
      { type: 'full_service', label: 'صيانة شاملة', since: sinceService, interval: e.full_service_hours },
    ].map(i => ({
      ...i,
      due_in: Math.max(0, i.interval - i.since),
      status: i.since >= i.interval ? 'overdue'
        : i.since >= i.interval * 0.8 ? 'due_soon'
        : 'ok',
    }))

    const worst = items.find(i => i.status === 'overdue') ?? items.find(i => i.status === 'due_soon') ?? items[0]

    return {
      id: e.id,
      name: e.name,
      generator_name: e.generator.name,
      branch_name: e.generator.branch.name,
      runtime_hours: totalH,
      items,
      overall_status: worst.status,
      total_lifetime_cost: e.maintenance_logs.reduce((s, l) => s + Number(l.cost ?? 0), 0),
      last_service_date: e.maintenance_logs[0]?.performed_at ?? null,
    }
  })

  // Sort by status priority
  const order = { overdue: 0, due_soon: 1, ok: 2 }
  enriched.sort((a, b) => (order as any)[a.overall_status] - (order as any)[b.overall_status])

  const overdueCount = enriched.filter(e => e.overall_status === 'overdue').length
  const dueSoonCount = enriched.filter(e => e.overall_status === 'due_soon').length

  return NextResponse.json({
    summary: {
      total_engines: enriched.length,
      overdue_count: overdueCount,
      due_soon_count: dueSoonCount,
      ok_count: enriched.length - overdueCount - dueSoonCount,
    },
    engines: enriched,
  })
}
