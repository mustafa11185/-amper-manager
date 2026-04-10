import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Stats for the manager: how much was collected via APS Fawateer-E channel
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalAllTime,
    monthAgg,
    recentTrx,
    byChannel,
    byBank,
  ] = await Promise.all([
    prisma.apsTransaction.aggregate({
      _sum: { paid_amount: true },
      _count: true,
      where: { tenant_id: tenantId, status: 'applied' },
    }),
    prisma.apsTransaction.aggregate({
      _sum: { paid_amount: true },
      _count: true,
      where: { tenant_id: tenantId, status: 'applied', received_at: { gte: monthStart } },
    }),
    prisma.apsTransaction.findMany({
      where: { tenant_id: tenantId },
      orderBy: { received_at: 'desc' },
      take: 30,
    }),
    prisma.apsTransaction.groupBy({
      by: ['access_channel'],
      _count: true,
      _sum: { paid_amount: true },
      where: { tenant_id: tenantId, status: 'applied', received_at: { gte: monthAgo } },
    }),
    prisma.apsTransaction.groupBy({
      by: ['bank_code'],
      _count: true,
      _sum: { paid_amount: true },
      where: { tenant_id: tenantId, status: 'applied', received_at: { gte: monthAgo } },
    }),
  ])

  // Attach subscriber names to recent transactions
  const subIds = [...new Set(recentTrx.map(t => t.subscriber_id).filter(Boolean) as string[])]
  const subs = subIds.length > 0
    ? await prisma.subscriber.findMany({
        where: { id: { in: subIds } },
        select: { id: true, name: true },
      })
    : []
  const subMap = new Map(subs.map(s => [s.id, s.name]))

  return NextResponse.json({
    summary: {
      total_collected_all_time: Number(totalAllTime._sum.paid_amount ?? 0),
      total_trx_all_time: totalAllTime._count,
      collected_this_month: Number(monthAgg._sum.paid_amount ?? 0),
      trx_this_month: monthAgg._count,
    },
    by_channel: byChannel.map(c => ({
      channel: c.access_channel,
      count: c._count,
      total: Number(c._sum.paid_amount ?? 0),
    })),
    by_bank: byBank.map(b => ({
      bank_code: b.bank_code,
      count: b._count,
      total: Number(b._sum.paid_amount ?? 0),
    })),
    recent_transactions: recentTrx.map(t => ({
      id: t.id,
      subscriber_name: t.subscriber_id ? subMap.get(t.subscriber_id) ?? '—' : '—',
      billing_no: t.billing_no,
      amount: Number(t.paid_amount),
      channel: t.access_channel,
      bank: t.bank_code,
      status: t.status,
      received_at: t.received_at,
    })),
  })
}
