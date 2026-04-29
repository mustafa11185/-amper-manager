// Server-to-server webhook from a payment gateway.
//
// URL shape: /api/payments/webhook/{gateway}/{tenantId}
//   - tenantId in the path → no need to peek payload to pick credentials.
//   - This URL must be registered with the gateway's business team.
//
// Per-gateway shapes are abstracted by adapter.verifyWebhook(body):
//   - ZainCash: `{ webhook_token: <JWT> }` — JWT verified with HS256 + api_key.
//                Production-only; UAT never fires.
//   - Qi:       payment object with paymentId — adapter calls inquire() to
//                defeat URL-guessing spoofers (no signature header).
//
// Idempotency: gateways retry on non-200. We dedupe by checking whether
// OnlinePayment is already in the target state.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGateway, type GatewayName, type VerifiedCallback } from '@/lib/payments'
import { sendSubscriberWhatsApp } from '@/lib/whatsapp-send'
import { recordPaymentResult } from '@/lib/payments/failure-alert'

function paymentConfirmationMessage(opts: {
  subscriberName?: string
  amount: number
  gateway: string
  reference: string
}): string {
  const { subscriberName, amount, gateway, reference } = opts
  const greeting = subscriberName ? `مرحباً ${subscriberName} 👋\n\n` : ''
  return (
    greeting +
    '✅ تم استلام دفعتك\n' +
    '═══════════════\n' +
    `المبلغ: ${amount.toLocaleString('en')} د.ع\n` +
    `البوابة: ${gateway}\n` +
    `المعرّف: ${reference.slice(0, 12)}\n` +
    '═══════════════\n' +
    'شكراً لتعاملكم معنا — AMPER ⚡'
  )
}

const SUPPORTED: GatewayName[] = ['zaincash', 'qi', 'asiapay']

function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ gateway: string; tenantId: string }> }
) {
  const { gateway, tenantId } = await ctx.params
  if (!SUPPORTED.includes(gateway as GatewayName)) {
    return NextResponse.json({ error: 'unsupported gateway' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (body === null) {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const adapter = await getGateway(tenantId, gateway as GatewayName)
  if (!adapter) {
    // Tenant disabled or removed this gateway — 200 to stop retries.
    console.warn(`[webhook/${gateway}] tenant ${tenantId} has no adapter`)
    return ok()
  }

  let verified: VerifiedCallback
  try {
    verified = await adapter.verifyWebhook(body)
  } catch (e: any) {
    console.error(`[webhook/${gateway}] verify failed for tenant ${tenantId}:`, e.message)
    return NextResponse.json({ error: 'verify failed' }, { status: 401 })
  }

  const op = await prisma.onlinePayment.findFirst({
    where: {
      tenant_id: tenantId,
      gateway,
      ...(verified.externalRef
        ? { gateway_ref: { startsWith: `${verified.externalRef}|` } }
        : { gateway_ref: { endsWith: `|${verified.gatewayTxId}` } }),
    },
    select: {
      id: true, tenant_id: true, subscriber_id: true, invoice_id: true,
      amount: true, status: true,
    },
  })
  if (!op) {
    console.warn(`[webhook/${gateway}] no OnlinePayment for ${verified.gatewayTxId}`)
    return ok({ ignored: 'unknown ref' })
  }

  if (verified.status === 'success') {
    if (op.status === 'success') return ok({ idempotent: true })

    let waPayload: { phone: string; name: string; amount: number } | null = null
    await prisma.$transaction(async (tx) => {
      await tx.onlinePayment.update({ where: { id: op.id }, data: { status: 'success' } })
      if (op.invoice_id) {
        const invoice = await tx.invoice.findUnique({
          where: { id: op.invoice_id },
          include: { subscriber: { select: { name: true, phone: true, total_debt: true } } },
        })
        if (invoice && !invoice.is_fully_paid) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              is_fully_paid: true,
              amount_paid: invoice.total_amount_due,
              payment_method: gateway,
            },
          })
          const paidAmount = Number(op.amount)
          // Overflow above invoiceUnpaid → decrement total_debt (mirror logic in
          // /api/payment/callback/[gateway]/route.ts; see comment there).
          const invoiceUnpaid = Math.max(0, Number(invoice.total_amount_due) - Number(invoice.amount_paid))
          const overflow = Math.max(0, paidAmount - invoiceUnpaid)
          if (overflow > 0 && invoice.subscriber) {
            await tx.subscriber.update({
              where: { id: invoice.subscriber_id },
              data: { total_debt: Math.max(0, Number(invoice.subscriber.total_debt) - overflow) },
            })
          }
          await tx.notification.create({
            data: {
              branch_id: invoice.branch_id, tenant_id: invoice.tenant_id,
              type: 'payment_online', title: 'دفع إلكتروني',
              body: `${invoice.subscriber?.name ?? ''} دفع إلكترونياً عبر ${gateway} — ${paidAmount.toLocaleString()} د.ع`,
              payload: { invoice_id: invoice.id, gateway, gatewayTxId: verified.gatewayTxId, amount: paidAmount },
            },
          })
          if (invoice.subscriber?.phone) {
            waPayload = { phone: invoice.subscriber.phone, name: invoice.subscriber.name ?? '', amount: paidAmount }
          }
        }
      } else if (op.subscriber_id) {
        const subscriber = await tx.subscriber.findUnique({ where: { id: op.subscriber_id } })
        if (subscriber) {
          await tx.subscriber.update({
            where: { id: subscriber.id },
            data: { total_debt: Math.max(0, Number(subscriber.total_debt) - Number(op.amount)) },
          })
          if (subscriber.phone) {
            waPayload = { phone: subscriber.phone, name: subscriber.name ?? '', amount: Number(op.amount) }
          }
        }
      }
    })
    // Fire-and-forget WhatsApp confirmation. The redirect-handler path may
    // have already sent one; sendSubscriberWhatsApp itself is idempotent at
    // the provider level (CallMeBot/Wasender accept duplicates), but in
    // practice the OnlinePayment.status=='success' guard above means only
    // the FIRST callback (redirect or webhook) reaches this branch.
    if (waPayload) {
      const { phone, name, amount } = waPayload as { phone: string; name: string; amount: number }
      sendSubscriberWhatsApp(
        tenantId,
        phone,
        paymentConfirmationMessage({ subscriberName: name, amount, gateway, reference: verified.gatewayTxId }),
      ).catch(e => console.warn(`[webhook/${gateway}] whatsapp failed:`, e?.message))
    }
    recordPaymentResult({ tenantId, gateway, status: 'success' })
      .catch(e => console.warn(`[webhook/${gateway}] failure-alert reset failed:`, e?.message))
    return ok({ processed: 'success' })
  }

  if (verified.status === 'failed' || verified.status === 'expired') {
    if (op.status === 'failed' || op.status === 'expired') return ok({ idempotent: true })
    await prisma.onlinePayment.update({
      where: { id: op.id },
      data: { status: verified.status === 'expired' ? 'expired' : 'failed' },
    })
    recordPaymentResult({ tenantId, gateway, status: verified.status })
      .catch(e => console.warn(`[webhook/${gateway}] failure-alert failed:`, e?.message))
    return ok({ processed: verified.status })
  }

  if (verified.status === 'refunded') {
    if (op.status === 'refunded') return ok({ idempotent: true })
    // Don't auto-reverse the Invoice — refunds touch accounting flow that
    // the owner needs to acknowledge first.
    await prisma.onlinePayment.update({ where: { id: op.id }, data: { status: 'refunded' } })
    return ok({ processed: 'refunded' })
  }

  console.warn(`[webhook/${gateway}] non-actionable status="${verified.status}" ref=${verified.gatewayTxId}`)
  return ok({ ignored: 'non-actionable' })
}
