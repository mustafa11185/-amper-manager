import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = req.nextUrl.searchParams.get('staff_id')
  const months = parseInt(req.nextUrl.searchParams.get('months') || '3')

  if (!staffId) return NextResponse.json({ error: 'staff_id مطلوب' }, { status: 400 })

  // Permission: owner/accountant can view any, staff can only view own
  if (user.role !== 'owner' && user.role !== 'accountant' && user.id !== staffId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // Tenant validation
  const wallet = await prisma.collectorWallet.findUnique({ where: { staff_id: staffId } })
  if (!wallet || wallet.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }

  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const deliveries = await prisma.deliveryRecord.findMany({
    where: {
      from_staff_id: staffId,
      delivered_at: { gte: since },
    },
    orderBy: { delivered_at: 'desc' },
  })

  // Enrich deliveries with salary payment info
  const deliveryIds = deliveries.map(d => d.id)
  const salaryPayments = await prisma.salaryPayment.findMany({
    where: { delivery_id: { in: deliveryIds } },
    select: { delivery_id: true, payment_type: true, amount: true },
  })

  const salaryMap = new Map(salaryPayments.map(sp => [sp.delivery_id, sp]))

  const enriched = deliveries.map(d => ({
    ...d,
    delivery_type: salaryMap.has(d.id) ? salaryMap.get(d.id)!.payment_type : 'delivery',
    salary_deduction: salaryMap.has(d.id),
    salary_amount: salaryMap.has(d.id) ? Number(salaryMap.get(d.id)!.amount) : 0,
  }))

  return NextResponse.json({ deliveries: enriched })
}
