import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { branch_id } = await req.json()

  if (!branch_id) return NextResponse.json({ error: 'branch_id required' }, { status: 400 })

  // Verify branch belongs to tenant
  const branch = await prisma.branch.findFirst({
    where: { id: branch_id, tenant_id: user.tenantId as string }
  })
  if (!branch) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  // Get latest pricing
  const pricing = await prisma.monthlyPricing.findFirst({
    where: { branch_id },
    orderBy: { effective_from: 'desc' },
  })

  if (!pricing) {
    return NextResponse.json({ error: 'يجب تحديد سعر الأمبير أولاً' }, { status: 400 })
  }

  const priceNormal = Number(pricing.price_per_amp_normal)
  const priceGold = Number(pricing.price_per_amp_gold)

  if (priceNormal <= 0 || priceGold <= 0) {
    return NextResponse.json({ error: 'يجب تحديد سعر الأمبير أولاً — الأسعار المحفوظة صفر' }, { status: 400 })
  }

  const billingMonth = new Date().getMonth() + 1
  const billingYear = new Date().getFullYear()

  // Find active subscribers with NO invoice at all for this billing period
  const activeSubscribers = await prisma.subscriber.findMany({
    where: { branch_id, is_active: true },
    select: { id: true, amperage: true, subscription_type: true, tenant_id: true },
  })

  const existingInvoiceSubIds = (await prisma.invoice.findMany({
    where: { branch_id, billing_month: billingMonth, billing_year: billingYear },
    select: { subscriber_id: true },
  })).map(i => i.subscriber_id)

  const newSubscribers = activeSubscribers.filter(s => !existingInvoiceSubIds.includes(s.id))

  let created = 0
  for (const sub of newSubscribers) {
    const pricePerAmp = sub.subscription_type === 'gold' ? priceGold : priceNormal
    const totalDue = Math.round(Number(sub.amperage) * pricePerAmp)

    const numResult = await prisma.$queryRaw<Array<{ num: string }>>`
      SELECT generate_invoice_number(${sub.tenant_id}, ${billingYear}::int) as num
    `
    const invoiceNumber = numResult[0]?.num ?? null

    await prisma.invoice.create({
      data: {
        subscriber_id: sub.id,
        branch_id,
        tenant_id: sub.tenant_id,
        billing_month: billingMonth,
        billing_year: billingYear,
        base_amount: totalDue,
        total_amount_due: totalDue,
        invoice_number: invoiceNumber,
      },
    })
    created++
  }

  return NextResponse.json({ ok: true, invoices_created: created, billing_month: billingMonth, billing_year: billingYear })
}
