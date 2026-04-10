import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Tech tasks report — maintenance logs performed by this staff
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffName = user.name as string
  const tenantId = user.tenantId as string

  const now = new Date()
  const month = parseInt(req.nextUrl.searchParams.get('month') ?? String(now.getMonth() + 1))
  const year = parseInt(req.nextUrl.searchParams.get('year') ?? String(now.getFullYear()))
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)

  const logs = await prisma.maintenanceLog.findMany({
    where: {
      tenant_id: tenantId,
      performed_by: staffName,
      performed_at: { gte: periodStart, lte: periodEnd },
    },
    include: { engine: { select: { name: true, generator: { select: { name: true } } } } },
    orderBy: { performed_at: 'desc' },
  })

  const totalCost = logs.reduce((s, l) => s + Number(l.cost ?? 0), 0)
  const byType: Record<string, number> = {}
  for (const l of logs) {
    byType[l.type] = (byType[l.type] || 0) + 1
  }

  return NextResponse.json({
    period: { month, year },
    summary: {
      total_tasks: logs.length,
      total_cost: totalCost,
      by_type: byType,
    },
    tasks: logs.map(l => ({
      id: l.id,
      type: l.type,
      engine: l.engine.name,
      generator: l.engine.generator.name,
      cost: Number(l.cost ?? 0),
      hours_at_service: Number(l.hours_at_service),
      description: l.description,
      performed_at: l.performed_at,
    })),
  })
}
