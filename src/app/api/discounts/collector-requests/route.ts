import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const branchId = req.nextUrl.searchParams.get('branch_id') || user.branchId
  const status = req.nextUrl.searchParams.get('status')

  const where: any = { tenant_id: user.tenantId }
  if (branchId) where.branch_id = branchId
  if (status) where.status = status

  const requests = await prisma.collectorDiscountRequest.findMany({
    where,
    include: {
      subscriber: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({
    requests: requests.map((r: any) => ({
      id: r.id,
      amount: Number(r.amount ?? 0),
      reason: r.reason ?? null,
      status: r.status,
      created_at: r.created_at?.toISOString() ?? '',
      staff_id: r.staff_id,
      staff_name: r.staff?.name ?? '',
      subscriber_id: r.subscriber_id,
      subscriber_name: r.subscriber?.name ?? '',
      invoice_id: r.invoice_id ?? null,
    })),
  })
}
