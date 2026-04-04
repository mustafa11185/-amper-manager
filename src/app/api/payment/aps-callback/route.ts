import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyApsSignature } from '@/lib/payment-service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchant_reference, status, fort_id, amount, response_code } = body

    console.log('[aps-callback]', JSON.stringify(body, null, 2))

    if (!merchant_reference) {
      return NextResponse.json({ ok: false, error: 'Invalid callback' }, { status: 400 })
    }

    const onlinePayment = await prisma.onlinePayment.findFirst({
      where: { gateway_ref: merchant_reference },
    })
    if (!onlinePayment) {
      console.error('[aps-callback] No payment found for:', merchant_reference)
      return NextResponse.json({ ok: false })
    }

    // Idempotency
    if (onlinePayment.status === 'success') {
      console.log('[aps] Already processed:', merchant_reference)
      return NextResponse.json({ ok: true, already_processed: true })
    }

    // Verify signature if branch has SHA response phrase
    if (onlinePayment.invoice_id) {
      const invoice = await prisma.invoice.findUnique({ where: { id: onlinePayment.invoice_id } })
      if (invoice) {
        const branch = await prisma.branch.findUnique({ where: { id: invoice.branch_id } })
        if (branch?.aps_sha_response_phrase) {
          const valid = verifyApsSignature(body, branch.aps_sha_response_phrase)
          if (!valid) {
            console.error('[aps-callback] Invalid signature')
            return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
          }
        }
      }
    }

    // APS success: response_code === '14000' or status === '14'
    const isApproved = response_code === '14000' || status === '14'

    if (isApproved) {
      await prisma.$transaction(async (tx) => {
        const paidAmount = amount ? Number(amount) / 1000 : Number(onlinePayment.amount)
        const commissionRate = 0.01 // 1% to Amper
        const commissionAmount = paidAmount * commissionRate

        await tx.onlinePayment.update({
          where: { id: onlinePayment.id },
          data: {
            status: 'success',
            gateway_ref: fort_id || merchant_reference,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
          },
        })

        let subscriberName = ''
        let branchId = ''
        let tenantId = onlinePayment.tenant_id

        if (onlinePayment.invoice_id) {
          const invoice = await tx.invoice.findUnique({
            where: { id: onlinePayment.invoice_id },
            include: { subscriber: { select: { name: true, branch_id: true } } },
          })
          if (invoice && !invoice.is_fully_paid) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { is_fully_paid: true, amount_paid: invoice.total_amount_due, payment_method: 'aps' },
            })
            subscriberName = invoice.subscriber?.name ?? ''
            branchId = invoice.branch_id
            tenantId = invoice.tenant_id
          }
        } else if (onlinePayment.subscriber_id) {
          const subscriber = await tx.subscriber.findUnique({ where: { id: onlinePayment.subscriber_id } })
          if (subscriber) {
            await tx.subscriber.update({
              where: { id: subscriber.id },
              data: { total_debt: Math.max(0, Number(subscriber.total_debt) - paidAmount) },
            })
            subscriberName = subscriber.name
            branchId = subscriber.branch_id
            tenantId = subscriber.tenant_id
          }
        }

        if (branchId && subscriberName) {
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_online', title: 'دفع إلكتروني',
              body: `💳 دفع إلكتروني: ${subscriberName} — ${paidAmount.toLocaleString()} د.ع (ماستركارد)`,
              payload: { fort_id, amount: paidAmount, subscriber_name: subscriberName },
            },
          })
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_online_collector',
              title: 'دفع إلكتروني — لم يُضف للمحفظة',
              body: `💳 ${subscriberName} دفع فاتورته إلكترونياً — ${paidAmount.toLocaleString()} د.ع (لم يُضف للمحفظة)`,
              payload: { fort_id, amount: paidAmount },
            },
          })
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_confirmed', title: 'تم استلام دفعتك',
              body: `✅ تم استلام دفعتك — ${paidAmount.toLocaleString()} د.ع. شكراً!`,
              payload: { subscriber_id: onlinePayment.subscriber_id, amount: paidAmount },
            },
          })
        }
      })
    } else {
      await prisma.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: { status: 'failed', gateway_ref: fort_id || merchant_reference },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[aps-callback] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
