import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const period = req.nextUrl.searchParams.get('period') ?? 'month'

  let since: Date
  if (period === 'today') {
    since = new Date(); since.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0)
  } else {
    since = new Date('2020-01-01')
  }

  try {
    const payments = await prisma.onlinePayment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'success',
        created_at: { gte: since },
      },
      select: {
        amount: true,
        gateway: true,
        commission_amount: true,
        fee_amount: true,
      },
    })

    let total = 0
    let commission = 0
    const byGateway: Record<string, { count: number; total: number }> = {}

    for (const p of payments) {
      const amt = Number(p.amount)
      total += amt
      commission += Number(p.commission_amount ?? amt * 0.01)

      const gw = p.gateway ?? 'unknown'
      if (!byGateway[gw]) byGateway[gw] = { count: 0, total: 0 }
      byGateway[gw].count++
      byGateway[gw].total += amt
    }

    return NextResponse.json({
      total,
      count: payments.length,
      commission: Math.round(commission),
      by_gateway: byGateway,
    })
  } catch (err: any) {
    console.error('online-report error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
