// Subscriber-side "I have a problem with a payment" intake.
//
// Persists a SupportTicket scoped to the subscriber's tenant and fires a
// branch-level Notification so the owner sees it in the staff app. We do NOT
// route this through Amper support — refunds/disputes belong to the merchant
// (per /portal/about-payments). The notification dedupe key prevents the
// same subscriber from spamming the same gatewayTxId.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

const ALLOWED_KINDS = new Set([
  'no_redirect',          // البوابة ما فتحت
  'paid_not_credited',    // دفعت لكن الفاتورة لازالت مفتوحة
  'wrong_amount',         // دُفع مبلغ خاطئ
  'duplicate_charge',     // سُحب المبلغ مرّتين
  'other',                // غير ذلك
])

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const subId = cookieStore.get('subscriber_id')?.value
    if (!subId) return NextResponse.json({ error: 'غير مسجل' }, { status: 401 })

    const body = await req.json().catch(() => null) as {
      kind?: string
      description?: string
      gateway?: string
      gateway_tx_id?: string
      invoice_id?: string
      amount?: number
    } | null
    if (!body) return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })

    const kind = ALLOWED_KINDS.has(body.kind ?? '') ? body.kind! : 'other'
    const description = (body.description ?? '').trim().slice(0, 2000)
    if (description.length < 10) {
      return NextResponse.json({ error: 'الرجاء كتابة وصف تفصيلي (10 أحرف على الأقل)' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subId },
      select: { id: true, name: true, phone: true, branch_id: true, tenant_id: true },
    })
    if (!subscriber) return NextResponse.json({ error: 'مشترك غير موجود' }, { status: 404 })

    const kindLabels: Record<string, string> = {
      no_redirect: 'البوابة لم تفتح',
      paid_not_credited: 'دفعت ولم تُغلق الفاتورة',
      wrong_amount: 'مبلغ خاطئ',
      duplicate_charge: 'سحب مزدوج',
      other: 'مشكلة أخرى',
    }
    const subjectLine = `${kindLabels[kind]} — ${subscriber.name ?? subId.slice(0, 8)}`

    const ticket = await prisma.supportTicket.create({
      data: {
        tenant_id: subscriber.tenant_id,
        title: subjectLine,
        body: [
          `المشترك: ${subscriber.name ?? '-'} (${subscriber.phone ?? '-'})`,
          body.gateway ? `البوابة: ${body.gateway}` : null,
          body.gateway_tx_id ? `معرف العملية: ${body.gateway_tx_id}` : null,
          body.invoice_id ? `الفاتورة: ${body.invoice_id}` : null,
          typeof body.amount === 'number' ? `المبلغ: ${body.amount.toLocaleString('en')} د.ع` : null,
          '',
          description,
        ].filter(Boolean).join('\n'),
        priority: kind === 'duplicate_charge' || kind === 'paid_not_credited' ? 'high' : 'normal',
      },
    })

    // Surface to owner/staff via the in-app notifications inbox. Dedupe so a
    // subscriber retrying the form against the same gatewayTxId doesn't flood.
    const dedupeKey = body.gateway_tx_id ? `payment_issue:${body.gateway_tx_id}` : `payment_issue:ticket:${ticket.id}`
    await prisma.notification.upsert({
      where: { tenant_id_dedupe_key: { tenant_id: subscriber.tenant_id, dedupe_key: dedupeKey } },
      create: {
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        type: 'payment_issue_reported',
        title: 'بلاغ مشكلة دفع',
        body: subjectLine,
        payload: { ticket_id: ticket.id, subscriber_id: subscriber.id, kind, ...body },
        dedupe_key: dedupeKey,
      },
      update: {
        is_read: false,
        body: subjectLine,
      },
    })

    return NextResponse.json({ ok: true, ticket_id: ticket.id })
  } catch (err: any) {
    console.error('[portal/report-payment-issue]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
