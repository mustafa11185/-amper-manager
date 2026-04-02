import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushToOwner, pushTemplates } from '@/lib/push'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const body = await req.json()
    const { subscriber_id, amount, pay_type, billing_month, payment_method, gps_lat, gps_lng, discount_amount, discount_reason, client_uuid } = body
    // pay_type: 'invoice' | 'debt' | 'all' (default: 'invoice')

    if (!subscriber_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // Dedup: check if this offline payment was already synced
    if (client_uuid) {
      try {
        const existing = await prisma.invoice.findFirst({
          where: { notes: { contains: client_uuid } },
        })
        if (existing) {
          return NextResponse.json({
            ok: true, duplicate: true,
            subscriber_name: (await prisma.subscriber.findUnique({ where: { id: subscriber_id }, select: { name: true } }))?.name,
          })
        }
      } catch {}
    }

    const selectedMonth = billing_month || (new Date().getMonth() + 1)
    const currentYear = new Date().getFullYear()
    const type = pay_type || 'invoice'

    const result = await prisma.$transaction(async (tx) => {
      const subscriber = await tx.subscriber.findUnique({
        where: { id: subscriber_id },
      })
      if (!subscriber) throw new Error('المشترك غير موجود')

      let invoicesUpdated = 0
      let debtReduced = 0

      // ── OWNER DISCOUNT: apply directly if owner/accountant ──
      const disc = Number(discount_amount) || 0
      if (disc > 0 && (user.role === 'owner' || user.role === 'accountant')) {
        // Find target invoice and apply discount
        const targetInv = await tx.invoice.findFirst({
          where: { subscriber_id, is_fully_paid: false },
          orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
        })
        if (targetInv) {
          const baseAmt = Number(targetInv.base_amount)
          const currentDisc = Number(targetInv.discount_amount)
          const newDisc = currentDisc + disc
          await tx.invoice.update({
            where: { id: targetInv.id },
            data: {
              discount_amount: newDisc,
              discount_type: 'fixed',
              discount_reason: discount_reason || 'خصم من المالك',
              total_amount_due: Math.max(0, baseAmt - newDisc),
            },
          })
        }
        // Create SubscriberDiscount record
        await tx.subscriberDiscount.create({
          data: {
            subscriber_id, branch_id: subscriber.branch_id, tenant_id: subscriber.tenant_id,
            discount_type: 'fixed', discount_value: disc,
            reason: discount_reason || 'خصم من المالك', is_active: true, applied_by: user.id ?? 'owner',
          },
        })
        // Audit log
        await tx.auditLog.create({
          data: {
            tenant_id: subscriber.tenant_id, branch_id: subscriber.branch_id,
            actor_id: user.id, actor_type: user.role, action: 'owner_discount',
            entity_type: 'subscriber', entity_id: subscriber_id,
            new_value: { discount_amount: disc, reason: discount_reason },
          },
        })
      }

      // ── INVOICE payment: distribute to invoices ──
      if (type === 'invoice' || type === 'all') {
        const unpaidInvoices = await tx.invoice.findMany({
          where: { subscriber_id, is_fully_paid: false },
          orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
        })

        // Prioritize selected month's invoice
        const sorted = unpaidInvoices.sort((a, b) => {
          const aIsTarget = a.billing_month === selectedMonth && a.billing_year === currentYear
          const bIsTarget = b.billing_month === selectedMonth && b.billing_year === currentYear
          if (aIsTarget && !bIsTarget) return -1
          if (!aIsTarget && bIsTarget) return 1
          if (a.billing_year !== b.billing_year) return a.billing_year - b.billing_year
          return a.billing_month - b.billing_month
        })

        // For 'invoice' type, only use the invoice portion of the amount
        // For 'all' type, distribute across invoices first, then debt
        let remaining = amount
        // If 'all', the debt portion will be handled below after invoices
        for (const inv of sorted) {
          if (remaining <= 0) break
          const due = Number(inv.total_amount_due) - Number(inv.amount_paid)
          const pay = Math.min(remaining, due)

          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              amount_paid: { increment: pay },
              is_fully_paid: pay >= due,
              payment_method,
              collector_id: user.role !== 'owner' ? user.id : null,
              received_by_owner: user.role === 'owner',
              ...(client_uuid ? { notes: `offline:${client_uuid}` } : {}),
            },
          })
          invoicesUpdated++
          remaining -= pay
        }

        // If 'all' and there's remaining after invoices, reduce debt
        if (type === 'all' && remaining > 0) {
          debtReduced = Math.min(remaining, Number(subscriber.total_debt))
        }
      }

      // ── DEBT payment: reduce total_debt directly ──
      if (type === 'debt') {
        debtReduced = Math.min(amount, Number(subscriber.total_debt))
      }

      // Apply debt reduction
      let newDebt = Number(subscriber.total_debt)
      if (debtReduced > 0) {
        newDebt = Math.max(0, newDebt - debtReduced)
        await tx.subscriber.update({
          where: { id: subscriber_id },
          data: { total_debt: newDebt },
        })
      } else if (type === 'invoice') {
        // For invoice-only, debt is not changed
        // (invoice payments don't affect accumulated debt)
      }

      // Create CollectorWallet entry for ALL non-owner roles
      // user.id IS the staff_id from JWT for non-owner users
      if (user.role !== 'owner') {
        const staffId = user.id as string
        await tx.collectorWallet.upsert({
          where: { staff_id: staffId },
          create: {
            staff_id: staffId,
            branch_id: user.branchId || subscriber.branch_id,
            tenant_id: subscriber.tenant_id,
            total_collected: amount,
            balance: amount,
          },
          update: {
            total_collected: { increment: amount },
            balance: { increment: amount },
            last_updated: new Date(),
          },
        })
      }

      // Create GPS log for non-owner roles
      if (gps_lat && gps_lng && user.role !== 'owner') {
        const staffId = user.id as string
        await tx.staffGpsLog.create({
          data: {
            staff_id: staffId,
            branch_id: user.branchId || subscriber.branch_id,
            tenant_id: subscriber.tenant_id,
            lat: gps_lat,
            lng: gps_lng,
            source: 'payment',
          },
        })
      }

      // Re-read subscriber to return fresh data
      const updated = await tx.subscriber.findUnique({
        where: { id: subscriber_id },
        select: { total_debt: true },
      })

      // Create payment notification
      const collectorName = user.role !== 'owner' ? (user.name || 'موظف') : 'المالك'
      await tx.notification.create({
        data: {
          branch_id: subscriber.branch_id,
          tenant_id: subscriber.tenant_id,
          type: 'payment',
          title: 'دفعة جديدة',
          body: `تم استلام ${amount.toLocaleString()} د.ع من ${subscriber.name} بواسطة ${collectorName}`,
        },
      })

      return {
        paid: amount,
        pay_type: type,
        billing_month: selectedMonth,
        remaining_debt: Number(updated?.total_debt ?? newDebt),
        debt_reduced: debtReduced,
        invoices_updated: invoicesUpdated,
        subscriber_name: subscriber.name,
      }
    })

    // Push notification to owner (only when staff pays, not when owner pays)
    if (user.role !== 'owner') {
      try {
        const subName = result.subscriber_name || ''
        const sub = await prisma.subscriber.findUnique({ where: { id: subscriber_id }, select: { tenant_id: true } })
        if (sub) {
          const push = pushTemplates.paymentReceived(user.name || 'جابي', amount, subName)
          sendPushToOwner({ tenant_id: sub.tenant_id, ...push }).catch(() => {})
        }
      } catch (_) {}
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في معالجة الدفع' }, { status: 500 })
  }
}
