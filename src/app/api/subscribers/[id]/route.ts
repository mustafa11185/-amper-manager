import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const subscriber = await prisma.subscriber.findUnique({
    where: { id },
    include: {
      invoices: {
        orderBy: { billing_year: 'desc' },
        take: 6,
      },
      discounts: {
        where: { is_active: true },
      },
      branch: { select: { name: true } },
    },
  }) as any

  // Attach public token if exists
  if (subscriber) {
    const pubToken = await prisma.subscriberPublicToken.findUnique({
      where: { subscriber_id: id },
    })
    subscriber.public_token = pubToken
  }

  if (!subscriber) {
    return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })
  }

  // Compute current_invoice from billing month
  let currentInvoice = null
  try {
    const pricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: subscriber.branch_id },
      orderBy: { effective_from: 'desc' },
    })
    const bMonth = pricing ? new Date(pricing.effective_from).getMonth() + 1 : new Date().getMonth() + 1
    const bYear = pricing ? new Date(pricing.effective_from).getFullYear() : new Date().getFullYear()

    const inv = await prisma.invoice.findFirst({
      where: { subscriber_id: id, billing_month: bMonth, billing_year: bYear },
    })
    if (inv) {
      const due = Number(inv.total_amount_due)
      const paid = Number(inv.amount_paid)
      currentInvoice = {
        id: inv.id,
        billing_month: inv.billing_month,
        billing_year: inv.billing_year,
        total_amount_due: due,
        amount_paid: paid,
        remaining: Math.max(0, due - paid),
        is_fully_paid: inv.is_fully_paid,
        base_amount: Number(inv.base_amount),
        discount_amount: Number(inv.discount_amount),
      }
    }
  } catch { /* skip */ }

  return NextResponse.json({
    subscriber: {
      ...subscriber,
      total_debt: Number(subscriber.total_debt),
      amperage: Number(subscriber.amperage),
      current_invoice: currentInvoice,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  // Only owner or accountant can edit subscribers
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'غير مصرح بتعديل المشتركين' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json()
    const { name, phone, whatsapp, address, alley, alley_id, governorate, amperage, subscription_type, is_active, gps_lat, gps_lng } = body

    // Get current subscriber to detect amperage/type changes
    const current = await prisma.subscriber.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    const subscriber = await prisma.subscriber.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(whatsapp !== undefined && { whatsapp: whatsapp || null }),
        ...(address !== undefined && { address }),
        ...(alley !== undefined && { alley }),
        ...(alley_id !== undefined && { alley_id: alley_id || null }),
        ...(governorate !== undefined && { governorate }),
        ...(amperage !== undefined && { amperage }),
        ...(subscription_type !== undefined && { subscription_type }),
        ...(is_active !== undefined && { is_active }),
        ...(gps_lat !== undefined && { gps_lat }),
        ...(gps_lng !== undefined && { gps_lng }),
      },
    })

    // If amperage or subscription_type changed, recalculate current month's unpaid invoice
    const amperageChanged = amperage !== undefined && Number(amperage) !== Number(current.amperage)
    const typeChanged = subscription_type !== undefined && subscription_type !== current.subscription_type
    if (amperageChanged || typeChanged) {
      try {
        const pricing = await prisma.monthlyPricing.findFirst({
          where: { branch_id: current.branch_id },
          orderBy: { effective_from: 'desc' },
        })
        if (pricing) {
          const effDate = new Date(pricing.effective_from)
          const bMonth = effDate.getMonth() + 1
          const bYear = effDate.getFullYear()

          const currentInvoice = await prisma.invoice.findFirst({
            where: {
              subscriber_id: id,
              billing_month: bMonth,
              billing_year: bYear,
              is_fully_paid: false,
            },
          })

          if (currentInvoice) {
            const newType = subscription_type ?? current.subscription_type
            const newAmperage = amperage !== undefined ? Number(amperage) : Number(current.amperage)
            const pricePerAmp = newType === 'gold'
              ? Number(pricing.price_per_amp_gold)
              : Number(pricing.price_per_amp_normal)
            const newTotal = Math.round(newAmperage * pricePerAmp)

            await prisma.invoice.update({
              where: { id: currentInvoice.id },
              data: {
                base_amount: newTotal,
                total_amount_due: newTotal,
              },
            })
          }
        }
      } catch {
        // Skip silently
      }
    }

    return NextResponse.json({ subscriber })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في تحديث المشترك' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه حذف المشتركين' }, { status: 403 })
  }

  const { id } = await params

  try {
    const subscriber = await prisma.subscriber.findUnique({ where: { id } })
    if (!subscriber) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    // Soft delete
    await prisma.subscriber.update({
      where: { id },
      data: { is_active: false, deleted_at: new Date() },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenant_id: subscriber.tenant_id,
        branch_id: subscriber.branch_id,
        actor_id: user.id ?? null,
        actor_type: 'owner',
        action: 'subscriber_deleted',
        entity_type: 'subscriber',
        entity_id: id,
        old_value: { name: subscriber.name, amperage: Number(subscriber.amperage) },
      },
    })

    return NextResponse.json({ ok: true, message: 'تم حذف المشترك' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في حذف المشترك' }, { status: 500 })
  }
}
