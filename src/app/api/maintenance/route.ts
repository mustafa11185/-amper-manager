import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — overview of all engines + maintenance status
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  // Get all engines for this tenant's branches
  const branches = await prisma.branch.findMany({
    where: user.role === 'owner' ? { tenant_id: tenantId } : { id: branchId },
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const engines = await prisma.engine.findMany({
    where: { generator: { branch_id: { in: branchIds } } },
    include: {
      generator: { select: { id: true, name: true, branch_id: true, branch: { select: { name: true } } } },
      maintenance_logs: {
        orderBy: { performed_at: 'desc' },
        take: 5,
      },
    },
    orderBy: { name: 'asc' },
  })

  const enriched = engines.map(e => {
    const totalH = Number(e.runtime_hours)
    const sinceOil = totalH - Number(e.hours_at_last_oil)
    const sinceFilter = totalH - Number(e.hours_at_last_filter)
    const sinceService = totalH - Number(e.hours_at_last_service)

    return {
      id: e.id,
      name: e.name,
      generator_id: e.generator.id,
      generator_name: e.generator.name,
      branch_name: e.generator.branch.name,
      runtime_hours: totalH,
      // Oil change
      oil_change_hours: e.oil_change_hours,
      hours_since_oil: sinceOil,
      oil_due: sinceOil >= e.oil_change_hours,
      oil_due_in: Math.max(0, e.oil_change_hours - sinceOil),
      // Air filter
      air_filter_hours: e.air_filter_hours,
      hours_since_filter: sinceFilter,
      filter_due: sinceFilter >= e.air_filter_hours,
      filter_due_in: Math.max(0, e.air_filter_hours - sinceFilter),
      // Full service
      full_service_hours: e.full_service_hours,
      hours_since_service: sinceService,
      service_due: sinceService >= e.full_service_hours,
      service_due_in: Math.max(0, e.full_service_hours - sinceService),
      // Recent logs
      recent_logs: e.maintenance_logs,
    }
  })

  return NextResponse.json({ engines: enriched })
}
