import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const events = await prisma.overloadEvent.findMany({
    where,
    orderBy: { detected_at: 'desc' },
    take: 100,
  })

  // Get generator names for the events
  const genIds = [...new Set(events.map(e => e.generator_id))]
  const generators = await prisma.generator.findMany({
    where: { id: { in: genIds } },
    select: { id: true, name: true },
  })
  const genMap = new Map(generators.map(g => [g.id, g.name]))

  const enriched = events.map(e => ({
    ...e,
    generator_name: genMap.get(e.generator_id) ?? '—',
  }))

  // 30-day stats
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const stats = await prisma.overloadEvent.aggregate({
    _count: true,
    _avg: { excess_amps: true, excess_pct: true },
    _max: { excess_amps: true },
    where: { ...where, detected_at: { gte: monthAgo } },
  })

  return NextResponse.json({
    events: enriched,
    stats: {
      count_30d: stats._count,
      avg_excess_amps: Number(stats._avg.excess_amps ?? 0),
      avg_excess_pct: Number(stats._avg.excess_pct ?? 0),
      max_excess_amps: Number(stats._max.excess_amps ?? 0),
    },
  })
}
