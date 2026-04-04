import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function verifyFuratPayHmac(body: any, secret: string): boolean {
  try {
    const sig = body.signature ?? body.hash ?? ''
    if (!sig) return true // sandbox may not send signature
    const fields = ['order_id', 'amount', 'currency', 'status']
    const str = fields.filter(f => body[f] != null).map(f => `${f}=${body[f]}`).join('&')
    const expected = crypto.createHmac('sha256', secret).update(str).digest('hex')
    return sig.toLowerCase() === expected.toLowerCase()
  } catch { return true } // fallback for sandbox
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, status, transaction_id, amount } = body

    console.log('[furatpay-callback]', JSON.stringify(body, null, 2))

    if (!order_id || !status) {
      return NextResponse.json({ ok: false, error: 'Invalid callback' }, { status: 400 })
    }

    // Find the online payment record
    const onlinePayment = await prisma.onlinePayment.findFirst({
      where: { gateway_ref: order_id },
    })
    if (!onlinePayment) {
      // Try with AMPER- prefix stripped
      const invoiceId = order_id.replace('AMPER-', '').replace('AMPER-PAY-', '')
      const fallback = await prisma.onlinePayment.findFirst({
        where: { invoice_id: invoiceId },
      })
      if (!fallback) {
        console.error('[furatpay-callback] No payment found for:', order_id)
        return NextResponse.json({ ok: false })
      }
    }

    const payment = onlinePayment || await prisma.onlinePayment.findFirst({ where: { gateway_ref: order_id } })
    if (!payment) return NextResponse.json({ ok: false })

    // Idempotency — don't reprocess
    if (payment.status === 'success') {
      console.log('[furatpay] Already processed:', order_id)
      return NextResponse.json({ ok: true, already_processed: true })
    }

    // HMAC verification
    try {
      const branch = await prisma.branch.findFirst({ where: { tenant_id: payment.tenant_id } })
      const secret = (branch as any)?.furatpay_secret_key ?? ''
      if (secret && !verifyFuratPayHmac(body, secret)) {
        console.error('[furatpay] Invalid HMAC signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } catch {}

    const isApproved = status === 'success' || status === 'paid'

    if (isApproved) {
      await prisma.$transaction(async (tx) => {
        const paidAmount = Number(amount || payment.amount)
        const commissionRate = 0.01 // 1% to Amper
        const commissionAmount = paidAmount * commissionRate

        await tx.onlinePayment.update({
          where: { id: payment.id },
          data: {
            status: 'success',
            gateway_ref: transaction_id || order_id,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
          },
        })

        let subscriberName = ''
        let branchId = ''
        let tenantId = payment.tenant_id

        if (payment.invoice_id) {
          const invoice = await tx.invoice.findUnique({
            where: { id: payment.invoice_id },
            include: { subscriber: { select: { name: true, branch_id: true } } },
          })
          if (invoice && !invoice.is_fully_paid) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { is_fully_paid: true, amount_paid: invoice.total_amount_due, payment_method: 'furatpay' },
            })
            subscriberName = invoice.subscriber?.name ?? ''
            branchId = invoice.branch_id
            tenantId = invoice.tenant_id
          }
        } else if (payment.subscriber_id) {
          const subscriber = await tx.subscriber.findUnique({ where: { id: payment.subscriber_id } })
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

        // NOTE: Online payments do NOT update CollectorWallet

        if (branchId && subscriberName) {
          // Notification for owner
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_online',
              title: 'دفع إلكتروني',
              body: `💳 دفع إلكتروني: ${subscriberName} — ${paidAmount.toLocaleString()} د.ع (ماستركارد)`,
              payload: { transaction_id, amount: paidAmount, subscriber_name: subscriberName },
            },
          })
          // Notification for collector
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_online_collector',
              title: 'دفع إلكتروني — لم يُضف للمحفظة',
              body: `💳 ${subscriberName} دفع فاتورته إلكترونياً — ${paidAmount.toLocaleString()} د.ع (لم يُضف للمحفظة)`,
              payload: { transaction_id, amount: paidAmount, subscriber_name: subscriberName },
            },
          })
          // Notification for subscriber
          await tx.notification.create({
            data: {
              branch_id: branchId, tenant_id: tenantId,
              type: 'payment_confirmed',
              title: 'تم استلام دفعتك',
              body: `✅ تم استلام دفعتك — ${paidAmount.toLocaleString()} د.ع. شكراً!`,
              payload: { transaction_id, amount: paidAmount, subscriber_id: payment.subscriber_id },
            },
          })
        }
      })
    } else {
      await prisma.onlinePayment.update({
        where: { id: payment.id },
        data: { status: status === 'declined' ? 'declined' : 'failed', gateway_ref: transaction_id || order_id },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[furatpay-callback] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
