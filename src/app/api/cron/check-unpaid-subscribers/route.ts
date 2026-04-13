import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export async function POST() {
  try {
    const now = new Date()
    const dayKey = now.toISOString().slice(0, 10)

    // Find all active subscribers with 3+ unpaid invoices
    const subscribers = await prisma.subscriber.findMany({
      where: { is_active: true },
      include: {
        invoices: { where: { is_fully_paid: false } },
      },
    })

    let flagged = 0

    for (const sub of subscribers) {
      if (sub.invoices.length >= 3) {
        // Flag subscriber
        if (!sub.needs_attention) {
          await prisma.subscriber.update({
            where: { id: sub.id },
            data: { needs_attention: true },
          })
        }

        // Dedupe per subscriber per day — createNotification enforces
        // preferences + uniqueness via dedupe_key so we don't need a
        // manual findFirst + today window query here anymore.
        const result = await createNotification({
          tenant_id: sub.tenant_id,
          branch_id: sub.branch_id,
          type: 'subscriber_unpaid_alert',
          title: 'مشترك متأخر ⚠️',
          body: `⚠️ ${sub.name} لم يدفع منذ ${sub.invoices.length} أشهر — الدين: ${Number(sub.total_debt).toLocaleString()} د.ع`,
          payload: { subscriber_id: sub.id, unpaid_months: sub.invoices.length },
          dedupe_key: `unpaid_${sub.id}_${dayKey}`,
        })
        if (result.created) flagged++
      } else if (sub.needs_attention && sub.invoices.length < 3) {
        // Clear flag if now below threshold
        await prisma.subscriber.update({
          where: { id: sub.id },
          data: { needs_attention: false },
        })
      }
    }

    return NextResponse.json({ ok: true, flagged, checked: subscribers.length })
  } catch (err: any) {
    console.error('[check-unpaid] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
