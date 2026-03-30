import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = session.user as any
    if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

    const body = await req.json()
    const { branch_id, price_per_amp_normal, price_per_amp_gold, billing_month, billing_year } = body

    if (!branch_id) return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
    if (!price_per_amp_normal || Number(price_per_amp_normal) <= 0) return NextResponse.json({ error: 'سعر الأمبير العادي مطلوب' }, { status: 400 })
    if (!price_per_amp_gold || Number(price_per_amp_gold) <= 0) return NextResponse.json({ error: 'سعر الأمبير الذهبي مطلوب' }, { status: 400 })
    if (!billing_month || !billing_year) return NextResponse.json({ error: 'الشهر والسنة مطلوبان' }, { status: 400 })

    const priceN = Number(price_per_amp_normal)
    const priceG = Number(price_per_amp_gold)
    const bMonth = Number(billing_month)
    const bYear = Number(billing_year)

    // Verify branch belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: user.tenantId as string },
    })
    if (!branch) return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })

    // Update or create pricing record
    const existing = await prisma.monthlyPricing.findFirst({
      where: { branch_id },
      orderBy: { effective_from: 'desc' },
    })

    if (existing) {
      await prisma.monthlyPricing.update({
        where: { id: existing.id },
        data: {
          price_per_amp_normal: priceN,
          price_per_amp_gold: priceG,
          effective_from: new Date(bYear, bMonth - 1, 1),
        },
      })
    } else {
      await prisma.monthlyPricing.create({
        data: {
          branch_id,
          price_per_amp_normal: priceN,
          price_per_amp_gold: priceG,
          billing_type: 'fixed',
          billing_mode: 'prepaid',
          effective_from: new Date(bYear, bMonth - 1, 1),
        },
      })
    }

    // Update ONLY unpaid invoices for this specific billing month/year
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        branch_id,
        is_fully_paid: false,
        billing_month: bMonth,
        billing_year: bYear,
      },
      include: { subscriber: { select: { amperage: true, subscription_type: true } } },
    })

    let updated = 0
    for (const inv of unpaidInvoices) {
      const sub = (inv as any).subscriber
      if (!sub) continue
      const pricePerAmp = sub.subscription_type === 'gold' ? priceG : priceN
      const newAmount = Math.round(Number(sub.amperage) * pricePerAmp)

      await prisma.invoice.update({
        where: { id: inv.id },
        data: { total_amount_due: newAmount, base_amount: newAmount },
      })
      updated++
    }

    return NextResponse.json({ ok: true, invoices_updated: updated, billing_month: bMonth, billing_year: bYear })
  } catch (error) {
    console.error('update-prices error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
