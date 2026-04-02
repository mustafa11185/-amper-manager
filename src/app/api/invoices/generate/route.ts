import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushToBranch, pushTemplates } from '@/lib/push'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { branch_id } = await req.json()
    const tenantId = user.tenantId as string

    if (!branch_id) {
      return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
    }

    // Verify branch belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: tenantId },
    })
    if (!branch) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

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

    if (priceNormal <= 0 && priceGold <= 0) {
      return NextResponse.json({ error: 'يجب تحديد سعر الأمبير أولاً' }, { status: 400 })
    }

    const billingMonth = new Date(pricing.effective_from).getMonth() + 1
    const billingYear = new Date(pricing.effective_from).getFullYear()

    if (!billingMonth || !billingYear) {
      return NextResponse.json({ error: 'يجب تحديد الشهر المستحق أولاً' }, { status: 400 })
    }

    // CHECK 3: Was invoice generation already done today for this branch?
    try {
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
          error: `تم الإصدار اليوم الساعة ${time} — يمكن الإصدار غداً`,
          already_generated_today: true,
        }, { status: 409 })
      }
    } catch (e: any) {
      console.log('InvoiceGenerationLog check failed (table may not exist):', e.message)
    }

    // Get all active subscribers
    const subscribers = await prisma.subscriber.findMany({
      where: { branch_id, is_active: true },
      select: { id: true, amperage: true, subscription_type: true, tenant_id: true, total_debt: true },
    })

    // Count unpaid invoices that will become debt
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        branch_id,
        is_fully_paid: false,
      },
      select: { id: true, subscriber_id: true, total_amount_due: true, amount_paid: true },
    })

    let totalCreated = 0
    let totalDebtAdded = 0

    await prisma.$transaction(async (tx) => {
      // Step 1: Roll unpaid invoices into subscriber debt
      const debtBySubscriber = new Map<string, number>()
      for (const inv of unpaidInvoices) {
        const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
        if (remaining > 0) {
          debtBySubscriber.set(inv.subscriber_id, (debtBySubscriber.get(inv.subscriber_id) || 0) + remaining)
        }
      }

      for (const [subId, debtAmount] of debtBySubscriber) {
        await tx.subscriber.update({
          where: { id: subId },
          data: { total_debt: { increment: debtAmount } },
        })
        totalDebtAdded++
      }

      // Mark unpaid invoices as rolled to debt
      if (unpaidInvoices.length > 0) {
        await tx.invoice.updateMany({
          where: {
            id: { in: unpaidInvoices.map(i => i.id) },
          },
          data: { is_fully_paid: true, payment_method: 'rolled_to_debt' },
        })
      }

      // Step 2: Create new invoices for all active subscribers
      for (const sub of subscribers) {
        const pricePerAmp = sub.subscription_type === 'gold' ? priceGold : priceNormal
        const totalDue = Math.round(Number(sub.amperage) * pricePerAmp)

        // Delete any existing invoice for this period (to avoid unique constraint)
        await tx.invoice.deleteMany({
          where: {
            subscriber_id: sub.id,
            billing_month: billingMonth,
            billing_year: billingYear,
            is_fully_paid: false,
            amount_paid: 0,
          },
        })

        await tx.invoice.create({
          data: {
            subscriber_id: sub.id,
            branch_id,
            tenant_id: tenantId,
            billing_month: billingMonth,
            billing_year: billingYear,
            base_amount: totalDue,
            total_amount_due: totalDue,
            amount_paid: 0,
            is_fully_paid: false,
          },
        })
        totalCreated++
      }

    })

    // Create generation log outside transaction (non-critical)
    try {
      await prisma.invoiceGenerationLog.create({
        data: {
          branch_id,
          tenant_id: tenantId,
          invoice_count: totalCreated,
          debt_count: totalDebtAdded,
          billing_month: billingMonth,
          billing_year: billingYear,
          generated_by: user.staffId || user.id || 'owner',
        },
      })
    } catch (logErr: any) {
      console.log('InvoiceGenerationLog creation failed:', logErr.message)
    }

    // Notify all collectors in branch
    try {
      const push = pushTemplates.invoiceGenerated(totalCreated, billingMonth)
      sendPushToBranch({ branch_id, ...push, roles: ['collector'] }).catch(() => {})
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      generated: totalCreated,
      debts_added: totalDebtAdded,
      billing_month: billingMonth,
      billing_year: billingYear,
    })
  } catch (err: any) {
    console.error('Invoice generate error:', err)
    return NextResponse.json({ error: err.message || 'خطأ في إصدار الفواتير' }, { status: 500 })
  }
}
