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

    // ── Idempotency: client_uuid ──
    // Offline payments may be retried multiple times by the device. The
    // server MUST treat the same client_uuid as the same payment and
    // return the same response shape on every call. Without this, a
    // network blip during sync creates duplicate invoices.
    //
    // The check is scoped to the subscriber's tenant — never cross-tenant.
    if (client_uuid) {
      try {
        // Look up the subscriber to know its tenant before checking dedup.
        const sub = await prisma.subscriber.findUnique({
          where: { id: subscriber_id },
          select: { tenant_id: true, name: true, total_debt: true },
        })
        if (sub) {
          const existing = await prisma.invoice.findFirst({
            where: {
              tenant_id: sub.tenant_id,
              notes: { contains: client_uuid },
            },
            select: { id: true, billing_month: true, amount_paid: true, total_amount_due: true },
          })
          if (existing) {
            // Return a response shape compatible with a fresh payment so the
            // client treats it identically to a successful sync.
            return NextResponse.json({
              ok: true,
              duplicate: true,
              paid: Number(amount),
              pay_type: pay_type || 'invoice',
              billing_month: existing.billing_month,
              remaining_debt: Number(sub.total_debt),
              debt_reduced: 0,
              invoices_updated: 1,
              subscriber_name: sub.name,
            })
          }
        }
      } catch (dedupErr) {
        // Dedup failure must not block the payment — fall through to
        // normal processing. Worst case: the unique constraint catches it.
        console.warn('[POS dedup] check failed:', dedupErr)
      }
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

      // ── DISCOUNT HANDLING ──
      const disc = Number(discount_amount) || 0
      if (disc > 0) {
        const isOwner = user.role === 'owner' || user.role === 'accountant'

        if (isOwner) {
          // Owner/accountant → apply discount directly to invoice
          const targetInv = await tx.invoice.findFirst({
            where: { subscriber_id, is_fully_paid: false },
            orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
          })
          if (targetInv) {
            const baseAmt = Number(targetInv.base_amount)
            const currentDisc = Number(targetInv.discount_amount)
            const amtPaid = Number(targetInv.amount_paid)
            const newDisc = currentDisc + disc
            const newTotal = Math.max(0, baseAmt - newDisc)
            // Discount can push a partially-paid invoice over the
            // new total — in that case flip is_fully_paid.
            const nowFullyPaid = amtPaid >= newTotal
            await tx.invoice.update({
              where: { id: targetInv.id },
              data: {
                discount_amount: newDisc,
                discount_type: 'fixed',
                discount_reason: discount_reason || 'خصم من المالك',
                total_amount_due: newTotal,
                is_fully_paid: nowFullyPaid,
              },
            })
          }
          await tx.subscriberDiscount.create({
            data: {
              subscriber_id, branch_id: subscriber.branch_id, tenant_id: subscriber.tenant_id,
              discount_type: 'fixed', discount_value: disc,
              reason: discount_reason || 'خصم من المالك', is_active: true, applied_by: user.id ?? 'owner',
            },
          })
          await tx.auditLog.create({
            data: {
              tenant_id: subscriber.tenant_id, branch_id: subscriber.branch_id,
              actor_id: user.id, actor_type: user.role, action: 'owner_discount',
              entity_type: 'subscriber', entity_id: subscriber_id,
              new_value: { discount_amount: disc, reason: discount_reason },
            },
          })
        } else {
          // Collector → create pending discount request (payment proceeds at full amount)
          const discRequest = await tx.collectorDiscountRequest.create({
            data: {
              tenant_id: subscriber.tenant_id,
              branch_id: subscriber.branch_id,
              staff_id: user.id,
              subscriber_id,
              amount: disc,
              reason: discount_reason || '',
              status: 'pending',
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          })
          // Notify owner about pending discount request
          await tx.notification.create({
            data: {
              branch_id: subscriber.branch_id,
              tenant_id: subscriber.tenant_id,
              type: 'discount_request',
              title: 'طلب خصم جديد 🏷️',
              body: `${user.name || 'جابي'} يطلب خصم ${disc.toLocaleString()} د.ع للمشترك ${subscriber.name}`,
              payload: {
                discount_request_id: discRequest.id,
                staff_id: user.id,
                staff_name: user.name,
                subscriber_id,
                amount: disc,
              },
            },
          })
        }
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

          // Increment amount_paid atomically, then use the returned
          // row's authoritative values to set is_fully_paid. This
          // avoids a race where the pre-read `due` is stale relative
          // to a concurrent payment on the same invoice.
          const updatedInv = await tx.invoice.update({
            where: { id: inv.id },
            data: {
              amount_paid: { increment: pay },
              payment_method,
              collector_id: user.role !== 'owner' ? user.id : null,
              received_by_owner: user.role === 'owner',
              ...(client_uuid ? { notes: `offline:${client_uuid}` } : {}),
            },
          })
          const nowFullyPaid = Number(updatedInv.amount_paid) >= Number(updatedInv.total_amount_due)
          if (nowFullyPaid && !updatedInv.is_fully_paid) {
            await tx.invoice.update({
              where: { id: inv.id },
              data: { is_fully_paid: true },
            })
          }
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

      // Check wallet threshold — notify owner if > 50,000
      if (user.role !== 'owner') {
        try {
          const wallet = await tx.collectorWallet.findUnique({ where: { staff_id: user.id as string } })
          if (wallet && Number(wallet.balance) > 50000) {
            const existing = await tx.notification.findFirst({
              where: { tenant_id: subscriber.tenant_id, type: 'wallet_threshold',
                created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            })
            if (!existing) {
              await tx.notification.create({
                data: {
                  branch_id: subscriber.branch_id, tenant_id: subscriber.tenant_id,
                  type: 'wallet_threshold',
                  title: 'تنبيه محفظة ⚠️',
                  body: `محفظة ${user.name || 'الجابي'} وصلت ${Number(wallet.balance).toLocaleString()} د.ع — يُنصح بالاستلام`,
                  payload: { staff_id: user.id, staff_name: user.name, balance: Number(wallet.balance) },
                },
              })
            }
          }
        } catch (_) {}
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

      // Create payment notification (skip if owner paying themselves)
      if (user.role !== 'owner') {
        await tx.notification.create({
          data: {
            branch_id: subscriber.branch_id,
            tenant_id: subscriber.tenant_id,
            type: 'payment',
            title: 'دفعة جديدة 💰',
            body: `${user.name || 'جابي'} استلم ${amount.toLocaleString()} د.ع من ${subscriber.name}`,
            payload: { subscriber_id, subscriber_name: subscriber.name, staff_id: user.id, staff_name: user.name, amount },
          },
        })
      }

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
