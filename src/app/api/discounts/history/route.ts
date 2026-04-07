import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { searchParams } = req.nextUrl
  const months = parseInt(searchParams.get('months') || '3')

  const since = new Date()
  since.setMonth(since.getMonth() - months)

  try {
    // Expired/inactive subscriber discounts
    const discounts = await prisma.subscriberDiscount.findMany({
      where: { tenant_id: tenantId, is_active: false, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      take: 50,
    })

    // Decided collector discount requests
    const requests = await prisma.collectorDiscountRequest.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['approved', 'rejected'] },
        created_at: { gte: since },
      },
      include: {
        subscriber: { select: { name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    })

    const history = [
      ...discounts.map((d: any) => ({
        id: d.id,
        reason: d.reason,
        discount_type: d.discount_type,
        discount_value: Number(d.discount_value),
        is_active: d.is_active,
        valid_until: d.valid_until,
        created_at: d.created_at,
        source: 'discount',
      })),
      ...requests.map((r: any) => ({
        id: r.id,
        reason: r.reason,
        discount_type: 'fixed',
        discount_value: Number(r.amount),
        status: r.status,
        subscriber_name: r.subscriber?.name,
        staff_name: r.staff?.name,
        created_at: r.created_at,
        source: 'request',
      })),
    ].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return NextResponse.json({ history })
  } catch (e: any) {
    return NextResponse.json({ history: [] })
  }
}
