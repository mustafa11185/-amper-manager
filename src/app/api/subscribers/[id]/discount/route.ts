import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = session.user as any
    if (user.role !== 'owner') return NextResponse.json({ error: 'المالك فقط' }, { status: 403 })

    const { id } = await params
    const { amount, reason } = await req.json()

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'مبلغ الخصم مطلوب' }, { status: 400 })
    }

    const discountAmount = Number(amount)

    const subscriber = await prisma.subscriber.findUnique({ where: { id } })
    if (!subscriber) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    // Get active billing month
    const bMonth = new Date().getMonth() + 1
    const bYear = new Date().getFullYear()

    // Find current unpaid invoice
    const invoice = await prisma.invoice.findFirst({
      where: { subscriber_id: id, billing_month: bMonth, billing_year: bYear, is_fully_paid: false },
    })

    await prisma.$transaction(async (tx) => {
      // Apply discount to invoice if exists
      if (invoice) {
        const currentDiscount = Number(invoice.discount_amount)
        const baseAmount = Number(invoice.base_amount)
        const newDiscount = currentDiscount + discountAmount
        const newTotal = Math.max(0, baseAmount - newDiscount)

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            discount_amount: newDiscount,
            discount_type: 'fixed',
            discount_value: discountAmount,
            discount_reason: reason || 'خصم من المالك',
            total_amount_due: newTotal,
          },
        })
      }

      // Create SubscriberDiscount record
      await tx.subscriberDiscount.create({
        data: {
          subscriber_id: id,
          branch_id: subscriber.branch_id,
          tenant_id: subscriber.tenant_id,
          discount_type: 'fixed',
          discount_value: discountAmount,
          reason: reason || 'خصم من المالك',
          is_active: true,
          applied_by: user.id ?? 'owner',
        },
      })

      // Audit log
      await tx.auditLog.create({
        data: {
          tenant_id: subscriber.tenant_id,
          branch_id: subscriber.branch_id,
          actor_id: user.id,
          actor_type: 'owner',
          action: 'owner_discount',
          entity_type: 'subscriber',
          entity_id: id,
          new_value: { amount: discountAmount, reason, invoice_id: invoice?.id ?? null },
        },
      })
    })

    return NextResponse.json({
      ok: true,
      message: `تم تطبيق خصم ${discountAmount.toLocaleString('en')} د.ع`,
    })
  } catch (error) {
    console.error('owner discount error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
