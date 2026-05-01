// Customer-redirect handler. Each gateway has its own redirect shape:
//   - ZainCash: `?token=<JWT>` — verifyRedirect decodes + verifies HS256
//   - Qi:       `?paymentId=…` — verifyRedirect calls inquire() to confirm
// We pin the tenant via `?t=<tenantId>` (added at initiate time) so the
// route can pick the right adapter without speculating.
//
// Idempotency: if the OnlinePayment is already finalized, redirect-only
// (no re-processing). Refreshing the success URL must never double-charge.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGateway, type GatewayName, type VerifiedCallback } from '@/lib/payments'
import { sendSubscriberWhatsApp } from '@/lib/whatsapp-send'
import { recordPaymentResult } from '@/lib/payments/failure-alert'

// Build the receipt body the subscriber sees on WhatsApp after a successful
// online payment. Mirrors the in-app `payment_confirmed` notification text
// so the subscriber sees the same wording across channels.
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

function userFacingRedirect(req: NextRequest, path: 'success' | 'failure', ref?: string) {
  // Behind Render's proxy `req.url` resolves to localhost:10000. Prefer the
  // forwarded host header (set by every Render/Cloudflare hop), then the
  // configured public URL, then req.url (local dev only).
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const url = new URL(`/payment/${path}`, baseUrl)
  if (ref) url.searchParams.set('ref', ref)
  return NextResponse.redirect(url, 302)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await ctx.params
  if (!SUPPORTED.includes(gateway as GatewayName)) {
    return NextResponse.json({ error: 'unsupported gateway' }, { status: 400 })
  }
  const tenantId = req.nextUrl.searchParams.get('t')
  if (!tenantId) {
    console.warn(`[payment/callback/${gateway}] missing t (tenant) param`)
    return userFacingRedirect(req, 'failure')
  }

  const adapter = await getGateway(tenantId, gateway as GatewayName)
  if (!adapter) {
    console.error(`[payment/callback/${gateway}] tenant ${tenantId} has no adapter configured`)
    return userFacingRedirect(req, 'failure')
  }

  let verified: VerifiedCallback
  try {
    verified = await adapter.verifyRedirect(req.nextUrl.searchParams)
  } catch (e: any) {
    console.error(`[payment/callback/${gateway}] verify failed:`, e.message)
    return userFacingRedirect(req, 'failure')
  }

  // Find the OnlinePayment row. We store gateway_ref as `<externalRef>|<gatewayTxId>`,
  // so prefix-match on externalRef when present, else suffix-match on gatewayTxId.
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
    console.warn(`[payment/callback/${gateway}] no OnlinePayment match for ${verified.gatewayTxId}`)
    return userFacingRedirect(req, 'failure')
  }

  if (op.status === 'success') return userFacingRedirect(req, 'success', verified.gatewayTxId)
  if (op.status === 'failed' || op.status === 'expired') return userFacingRedirect(req, 'failure', verified.gatewayTxId)

  if (verified.status === 'success') {
    // Capture data we need for the post-transaction WhatsApp send. The
    // notification fires AFTER the DB transaction so a transient WhatsApp
    // failure can't roll back the payment record.
    let waPayload: { phone: string; name: string; amount: number; tenantId: string } | null = null
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
          // Overflow above the invoice unpaid portion goes against pre-existing
          // total_debt (the portal sends `invoiceUnpaid + total_debt` as one sum;
          // without this, the merchant gets the cash but the debt counter never
          // moves). init/route.ts already caps amount at `invoiceUnpaid + debt`.
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
          await tx.notification.create({
            data: {
              branch_id: invoice.branch_id, tenant_id: invoice.tenant_id,
              type: 'payment_confirmed', title: 'تم استلام دفعتك',
              body: `تم استلام دفعتك — ${paidAmount.toLocaleString()} د.ع. شكراً!`,
              payload: { subscriber_id: op.subscriber_id, amount: paidAmount },
            },
          })
          if (invoice.subscriber?.phone) {
            waPayload = {
              phone: invoice.subscriber.phone,
              name: invoice.subscriber.name ?? '',
              amount: paidAmount,
              tenantId: invoice.tenant_id,
            }
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
            waPayload = {
              phone: subscriber.phone,
              name: subscriber.name ?? '',
              amount: Number(op.amount),
              tenantId: subscriber.tenant_id,
            }
          }
        }
      }
    })
    // Fire-and-forget: WhatsApp send must not block the redirect.
    if (waPayload) {
      const { phone, name, amount, tenantId } = waPayload as { phone: string; name: string; amount: number; tenantId: string }
      sendSubscriberWhatsApp(
        tenantId,
        phone,
        paymentConfirmationMessage({ subscriberName: name, amount, gateway, reference: verified.gatewayTxId }),
      ).catch(e => console.warn(`[payment/callback/${gateway}] whatsapp failed:`, e?.message))
    }
    recordPaymentResult({ tenantId, gateway, status: 'success' })
      .catch(e => console.warn(`[payment/callback/${gateway}] failure-alert reset failed:`, e?.message))
    return userFacingRedirect(req, 'success', verified.gatewayTxId)
  }

  if (verified.status === 'failed' || verified.status === 'expired') {
    await prisma.onlinePayment.update({
      where: { id: op.id },
      data: { status: verified.status === 'expired' ? 'expired' : 'failed' },
    })
    recordPaymentResult({ tenantId, gateway, status: verified.status })
      .catch(e => console.warn(`[payment/callback/${gateway}] failure-alert failed:`, e?.message))
    return userFacingRedirect(req, 'failure', verified.gatewayTxId)
  }

  // pending or unknown — leave the row alone, user lands on failure page.
  console.warn(`[payment/callback/${gateway}] non-final status="${verified.status}" for ${verified.gatewayTxId}`)
  return userFacingRedirect(req, 'failure', verified.gatewayTxId)
}
