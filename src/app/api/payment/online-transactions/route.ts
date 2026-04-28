import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const params = req.nextUrl.searchParams
  const period = params.get('period') ?? 'month'
  const gateway = params.get('gateway') ?? 'all'
  const status = params.get('status') ?? 'all'

  let since: Date
  if (period === 'today') {
    since = new Date(); since.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0)
  } else {
    since = new Date('2020-01-01')
  }

  const where: any = {
    tenant_id: tenantId,
    created_at: { gte: since },
  }

  if (gateway !== 'all') where.gateway = gateway
  if (status !== 'all') where.status = status

  try {
    const payments = await prisma.onlinePayment.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 200,
    })

    // Fetch subscriber names for payments that have subscriber_id
    const subIds = payments.map(p => p.subscriber_id).filter(Boolean) as string[]
    const subscribers = subIds.length > 0
      ? await prisma.subscriber.findMany({
          where: { id: { in: subIds } },
          select: { id: true, name: true, serial_number: true, access_code: true },
        })
      : []
    const subMap = Object.fromEntries(subscribers.map(s => [s.id, s]))

    const transactions = payments.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      gateway: p.gateway,
      gateway_ref: p.gateway_ref,
      status: p.status,
      commission: Number(p.commission_amount ?? Number(p.amount) * 0.01),
      subscriber_name: p.subscriber_id ? (subMap[p.subscriber_id]?.name ?? '') : '',
      subscriber_code: p.subscriber_id ? (subMap[p.subscriber_id]?.access_code ?? '') : '',
      invoice_id: p.invoice_id,
      created_at: p.created_at.toISOString(),
    }))

    // Summary (gateway-agnostic — works for any value of OnlinePayment.gateway)
    const successPayments = payments.filter(p => p.status === 'success')
    const total = successPayments.reduce((s, p) => s + Number(p.amount), 0)

    // by_gateway: { [gateway]: { count, total } } — used by the UI to render
    // a per-gateway chip row without hardcoding a list of names.
    const byGateway: Record<string, { count: number; total: number }> = {}
    for (const p of successPayments) {
      const g = p.gateway || 'unknown'
      if (!byGateway[g]) byGateway[g] = { count: 0, total: 0 }
      byGateway[g].count += 1
      byGateway[g].total += Number(p.amount)
    }

    return NextResponse.json({
      transactions,
      summary: {
        total,
        count: successPayments.length,
        by_gateway: byGateway,
      },
    })
  } catch (err: any) {
    console.error('online-transactions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
