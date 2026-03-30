import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const { branch_id } = await req.json()
    if (!branch_id) return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })

    // Get pricing
    const pricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id },
      orderBy: { effective_from: 'desc' },
    })

    if (!pricing) {
      return NextResponse.json({ check_failed: 'no_pricing', error: 'يجب تحديد سعر الأمبير أولاً' })
    }

    const priceNormal = Number(pricing.price_per_amp_normal)
    const priceGold = Number(pricing.price_per_amp_gold)

    if (priceNormal <= 0 && priceGold <= 0) {
      return NextResponse.json({ check_failed: 'no_pricing', error: 'يجب تحديد سعر الأمبير أولاً' })
    }

    const billingMonth = new Date(pricing.effective_from).getMonth() + 1
    const billingYear = new Date(pricing.effective_from).getFullYear()

    if (!billingMonth || !billingYear) {
      return NextResponse.json({ check_failed: 'no_month', error: 'يجب تحديد الشهر المستحق أولاً' })
    }

    // Check if already generated today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const lastGenToday = await prisma.invoiceGenerationLog.findFirst({
      where: {
        branch_id,
        is_reversed: false,
        generated_at: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { generated_at: 'desc' },
    })

    if (lastGenToday) {
      const time = new Date(lastGenToday.generated_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
      return NextResponse.json({
        check_failed: 'already_today',
        error: `تم الإصدار اليوم الساعة ${time} — يمكن الإصدار غداً`,
      })
    }

    // Count active subscribers
    const activeCount = await prisma.subscriber.count({
      where: { branch_id, is_active: true },
    })

    // Count unpaid invoices
    const unpaidCount = await prisma.invoice.count({
      where: { branch_id, is_fully_paid: false },
    })

    return NextResponse.json({
      ok: true,
      active_count: activeCount,
      unpaid_count: unpaidCount,
      billing_month: billingMonth,
      billing_year: billingYear,
      price_normal: priceNormal,
      price_gold: priceGold,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
