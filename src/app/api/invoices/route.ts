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

  const url = req.nextUrl.searchParams
  const subscriberId = url.get('subscriber_id')
  const page = parseInt(url.get('page') || '1')
  const limit = parseInt(url.get('limit') || '20')

  const where: any = {
    tenant_id: tenantId,
    // Staff can only see invoices from their branch
    ...(user.role !== 'owner' && branchId ? { branch_id: branchId } : {}),
  }
  if (subscriberId) where.subscriber_id = subscriberId

  // Owner can filter by branch_id query param
  const qBranch = url.get('branch_id')
  if (qBranch) where.branch_id = qBranch

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ billing_year: 'desc' }, { billing_month: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        subscriber: { select: { name: true, serial_number: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ])

  return NextResponse.json({ invoices, total, pages: Math.ceil(total / limit) })
}
