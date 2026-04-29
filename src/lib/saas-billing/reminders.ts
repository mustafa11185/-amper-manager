/**
 * Billing reminder dispatcher.
 *
 * Sends in-app push notification + WhatsApp message when subscription is
 * approaching expiry or has expired. Uses existing infrastructure:
 *   - createNotification() for in-app + dedupe + opt-out
 *   - sendTenantAlert() for WhatsApp via the tenant's configured provider
 *
 * Bilingual messages (Arabic primary, English appended for clarity).
 */

import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { sendTenantAlert } from '@/lib/whatsapp-send';

type ReminderKind = 'expiring_soon' | 'expires_today' | 'in_grace';

interface DispatchInput {
  tenantId: string;
  daysUntilExpiry: number; // negative = past expiry (in grace)
  planName: string;
  expiryDate: Date;
  kind: ReminderKind;
}

interface DispatchResult {
  pushSent: boolean;
  whatsappSent: boolean;
  reason?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://manager.amper.iq';

function buildMessage(input: DispatchInput): { title: string; body: string; whatsapp: string } {
  const { daysUntilExpiry: d, planName, expiryDate, kind } = input;
  const dateStr = expiryDate.toLocaleDateString('ar-IQ');
  const billingUrl = `${APP_URL}/staff/billing`;

  switch (kind) {
    case 'expiring_soon': {
      const dayWord = d === 1 ? 'يوم واحد' : `${d} أيام`;
      return {
        title: `⏰ اشتراكك ينتهي خلال ${dayWord}`,
        body: `باقة ${planName} تنتهي بتاريخ ${dateStr}. جدّد الآن لتجنّب توقف الخدمة.`,
        whatsapp:
          `⚡ *أمبير · تذكير اشتراك*\n\n` +
          `اشتراكك بباقة *${planName}* ينتهي خلال *${dayWord}* (${dateStr}).\n\n` +
          `جدّد الآن لتجنّب توقف الخدمة:\n${billingUrl}\n\n` +
          `_للاستفسار: support@amper.iq_`,
      };
    }
    case 'expires_today': {
      return {
        title: `🚨 اشتراكك ينتهي اليوم`,
        body: `باقة ${planName} تنتهي اليوم. جدّد الآن لتجنّب توقف الخدمة.`,
        whatsapp:
          `🚨 *أمبير · اشتراكك ينتهي اليوم*\n\n` +
          `باقة *${planName}* تنتهي اليوم (${dateStr}).\n\n` +
          `جدّد الآن قبل توقف الخدمة:\n${billingUrl}\n\n` +
          `_فترة سماح 7 أيام بعد الانتهاء، ثم يتم تعليق الحساب._`,
      };
    }
    case 'in_grace': {
      const daysLeft = Math.max(0, 7 + d); // d is negative
      return {
        title: `⚠️ فترة سماح · ${daysLeft} أيام متبقية`,
        body: `اشتراكك انتهى. جدّد خلال ${daysLeft} أيام لتفادي تعليق الحساب.`,
        whatsapp:
          `⚠️ *أمبير · فترة سماح*\n\n` +
          `اشتراكك بباقة *${planName}* انتهى بتاريخ ${dateStr}.\n` +
          `لديك *${daysLeft} أيام* فقط قبل تعليق الحساب.\n\n` +
          `جدّد الآن:\n${billingUrl}`,
      };
    }
  }
}

/**
 * Send the reminder. Idempotent for the same (tenant, kind, day) combination
 * because we set a dedupe_key on the notification. WhatsApp is best-effort:
 * if the tenant doesn't have alerts configured we just skip silently.
 */
export async function dispatchReminder(input: DispatchInput): Promise<DispatchResult> {
  const { tenantId, daysUntilExpiry, kind } = input;
  const msg = buildMessage(input);

  // Find a default branch — required by Notification.branch_id NOT NULL.
  const branch = await prisma.branch.findFirst({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  if (!branch) {
    return { pushSent: false, whatsappSent: false, reason: 'NO_BRANCH' };
  }

  // Dedupe key includes the absolute day, so a single tenant gets at most
  // one reminder per (kind, day) — re-running the cron is safe.
  const dedupeKey = `billing:${kind}:${daysUntilExpiry}:${input.expiryDate.toISOString().slice(0, 10)}`;

  const notifResult = await createNotification({
    tenant_id: tenantId,
    branch_id: branch.id,
    type: 'billing_reminder',
    title: msg.title,
    body: msg.body,
    dedupe_key: dedupeKey,
    payload: {
      kind,
      days_until_expiry: daysUntilExpiry,
      plan: input.planName,
      url: `${APP_URL}/staff/billing`,
    },
  });

  // WhatsApp — only fire on first creation, not on dedupe hits.
  let whatsappSent = false;
  if (notifResult.created) {
    try {
      whatsappSent = await sendTenantAlert(tenantId, msg.whatsapp);
    } catch (err) {
      console.error(`[reminders] WhatsApp send failed tenant=${tenantId}:`, err);
    }
  }

  return {
    pushSent: notifResult.created,
    whatsappSent,
    reason: notifResult.created ? undefined : (notifResult as { reason: string }).reason,
  };
}
