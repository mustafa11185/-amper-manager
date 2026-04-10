import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const typeFilter = req.nextUrl.searchParams.get('type')
  if (typeFilter && typeFilter !== 'all') where.type = typeFilter

  const events = await prisma.fuelEvent.findMany({
    where,
    include: { device: { select: { id: true, name: true } } },
    orderBy: { occurred_at: 'desc' },
    take: 100,
  })

  // Stats: totals for last 30 days
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentTheft = await prisma.fuelEvent.aggregate({
    _sum: { liters_est: true, cost_est_iqd: true },
    _count: true,
    where: { ...where, type: 'theft_suspected', occurred_at: { gte: monthAgo } },
  })

  return NextResponse.json({
    events,
    stats: {
      theft_count_30d: recentTheft._count,
      theft_liters_30d: Number(recentTheft._sum.liters_est ?? 0),
      theft_cost_iqd_30d: Number(recentTheft._sum.cost_est_iqd ?? 0),
    },
  })
}
