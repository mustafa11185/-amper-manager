// When a gateway logs N consecutive non-success results (failed/expired) the
// owner should hear about it — usually means a misconfigured key, a UAT/prod
// mismatch, or the gateway being down. We send a single WhatsApp ping and
// dedupe on Notification.dedupe_key so the owner doesn't get a flood while
// the issue persists. The dedupe key resets after the next success on the
// same gateway, which is when this function clears the latch.

import { prisma } from '@/lib/prisma'
import { sendTenantAlert } from '@/lib/whatsapp-send'

const STREAK_THRESHOLD = 3
// One window is enough to detect a current outage — older history would
// false-trigger on long-resolved incidents.
const LOOKBACK_WINDOW = 8

export async function recordPaymentResult(opts: {
  tenantId: string
  gateway: string
  status: 'success' | 'failed' | 'expired' | 'refunded' | 'pending'
}): Promise<void> {
  const { tenantId, gateway, status } = opts
  // We only act on terminal-failure or success outcomes. Pending/refunded are
  // not a signal of a misconfiguration so they don't move the streak counter.
  if (status !== 'success' && status !== 'failed' && status !== 'expired') return

  // Reset the latch on the first success after a streak so the next streak
  // can fire again. Cheap upsert vs. tracking state in a separate table.
  if (status === 'success') {
    await prisma.notification.deleteMany({
      where: { tenant_id: tenantId, dedupe_key: `gateway_streak_failure:${gateway}` },
    }).catch(() => undefined)
    return
  }

  // Only fire after we observe N back-to-back failures. Look at the last
  // LOOKBACK_WINDOW records (sorted desc); if the first STREAK_THRESHOLD are
  // all failed/expired, raise the alarm.
  const recent = await prisma.onlinePayment.findMany({
    where: { tenant_id: tenantId, gateway, status: { in: ['success', 'failed', 'expired'] } },
    orderBy: { created_at: 'desc' },
    take: LOOKBACK_WINDOW,
    select: { status: true },
  })
  const streak = recent.findIndex(r => r.status === 'success')
  const failureRunLength = streak === -1 ? recent.length : streak
  if (failureRunLength < STREAK_THRESHOLD) return

  // Find the tenant's branches so the notification has a branch_id (column
  // is non-null on Notification). Fall back to the first branch we find.
  const branch = await prisma.branch.findFirst({
    where: { tenant_id: tenantId },
    select: { id: true },
  })
  if (!branch) return

  // Dedupe so the owner only gets ONE WhatsApp + one in-app row per outage.
  const dedupeKey = `gateway_streak_failure:${gateway}`
  const existing = await prisma.notification.findFirst({
    where: { tenant_id: tenantId, dedupe_key: dedupeKey },
    select: { id: true },
  })
  if (existing) return

  await prisma.notification.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      type: 'payment_gateway_outage',
      title: 'تعطّل بوابة الدفع',
      body: `بوابة ${gateway} سجّلت ${failureRunLength} عمليات فاشلة متتالية. تحقّق من الإعدادات أو حالة البوابة.`,
      payload: { gateway, streak: failureRunLength },
      dedupe_key: dedupeKey,
    },
  })

  // Best-effort WhatsApp to the owner. Failure here is silent because the
  // in-app row above is the durable record.
  const message = [
    '⚠️ تنبيه أمبير',
    '═══════════════',
    `بوابة ${gateway} فشلت ${failureRunLength} مرات متتالية.`,
    'تحقّق من إعدادات البوابة أو تواصل مع المزوّد.',
  ].join('\n')
  sendTenantAlert(tenantId, message).catch(e => {
    console.warn(`[payment-failure-alert/${gateway}] alert send failed:`, e?.message ?? e)
  })
}
