import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const branches = await prisma.branch.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: { id: true, name: true },
  })

  const pricingRecords = await Promise.all(
    branches.map(async (branch) => {
      const pricing = await prisma.monthlyPricing.findFirst({
        where: { branch_id: branch.id },
        orderBy: { effective_from: 'desc' },
      })
      return { branch, pricing }
    })
  )

  return NextResponse.json({ pricing: pricingRecords })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { branch_id, price_per_amp_normal, price_per_amp_gold, billing_month, billing_year } = await req.json()

    if (!branch_id || price_per_amp_normal == null || price_per_amp_gold == null) {
      return NextResponse.json({ error: 'السعران مطلوبان' }, { status: 400 })
    }

    if (Number(price_per_amp_normal) <= 0 || Number(price_per_amp_gold) <= 0) {
      return NextResponse.json({ error: 'السعر يجب أن يكون أكبر من صفر' }, { status: 400 })
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: user.tenantId as string },
    })
    if (!branch) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

    // Store billing_month/year in the effective_from date for retrieval
    // and also in billing_type field as "fixed" (default)
    const now = new Date()
    const effectiveDate = billing_month && billing_year
      ? new Date(billing_year, billing_month - 1, 1)
      : now

    const record = await prisma.monthlyPricing.create({
      data: {
        branch_id,
        billing_type: 'fixed',
        price_per_amp_normal,
        price_per_amp_gold,
        billing_mode: 'prepaid',
        effective_from: effectiveDate,
      },
    })

    // Return with billing_month/year for the frontend
    return NextResponse.json({
      pricing: {
        ...record,
        billing_month: billing_month || (now.getMonth() + 1),
        billing_year: billing_year || now.getFullYear(),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في الحفظ' }, { status: 500 })
  }
}
