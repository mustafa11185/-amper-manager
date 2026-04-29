/**
 * Daily cron: SaaS subscription auto-renewal + reminders.
 *
 * Run schedule: once per day (e.g. 09:00 Iraq time).
 *
 * Logic:
 *   1. T-7, T-3, T-1 days before expiry → expiring_soon reminder (push + WhatsApp)
 *   2. T-0 (expires today) → expires_today reminder + try auto-charge
 *   3. T+1 to T+6 (in grace) → in_grace reminder
 *
 * Triggers existing /check-subscriptions cron afterwards (which handles grace + suspend).
 *
 * Note: Real "save card and recharge silently" only works on gateways supporting
 * tokenized recurring (ZainCash supports it; Qi/AsiaPay are session-based).
 * For session-based gateways we generate a fresh checkout URL (the user still has
 * to confirm in-gateway). Caller can WhatsApp the URL via dispatchReminder().
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initiateCheckout } from '@/lib/saas-billing';
import { dispatchReminder } from '@/lib/saas-billing/reminders';
import type { GatewayName } from '@/lib/payments/types';
import { verifyCronAuth } from '@/lib/cron-auth';

const DAY_MS = 24 * 60 * 60 * 1000;
// Days-until-expiry windows we act on. Positive = before, 0 = today, negative = grace.
const REMINDER_WINDOWS = [7, 3, 1, 0, -1, -3, -6];

interface ProcessResult {
  scanned: number;
  remindersSent: number;
  remindersDeduped: number;
  whatsappSent: number;
  autoChargeAttempts: number;
  errors: Array<{ tenantId: string; error: string }>;
}

export async function POST(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;
  return runAutoRenew();
}
export async function GET(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;
  return runAutoRenew();
}

async function runAutoRenew() {
  const result: ProcessResult = {
    scanned: 0,
    remindersSent: 0,
    remindersDeduped: 0,
    whatsappSent: 0,
    autoChargeAttempts: 0,
    errors: [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const tenants = await prisma.tenant.findMany({
    where: {
      is_active: true,
      OR: [
        { subscription_ends_at: { not: null } },
        { is_trial: true, trial_ends_at: { not: null } },
      ],
    },
    select: {
      id: true,
      phone: true,
      plan: true,
      is_trial: true,
      trial_ends_at: true,
      subscription_ends_at: true,
      auto_renew_enabled: true,
      default_payment_method_id: true,
    },
  });

  for (const tenant of tenants) {
    result.scanned++;
    try {
      const expiry = tenant.is_trial ? tenant.trial_ends_at : tenant.subscription_ends_at;
      if (!expiry) continue;

      const daysUntil = Math.floor((expiry.getTime() - todayStart.getTime()) / DAY_MS);
      if (!REMINDER_WINDOWS.includes(daysUntil)) continue;

      // Plan display name from catalog (fallback to enum value if missing)
      const planRow = await prisma.plan.findUnique({ where: { id: tenant.plan } });
      const planName = planRow?.name_ar || tenant.plan;

      // Decide reminder kind from days-until-expiry
      const kind: 'expiring_soon' | 'expires_today' | 'in_grace' =
        daysUntil > 0 ? 'expiring_soon' : daysUntil === 0 ? 'expires_today' : 'in_grace';

      const dispatch = await dispatchReminder({
        tenantId: tenant.id,
        daysUntilExpiry: daysUntil,
        planName,
        expiryDate: expiry,
        kind,
      });

      if (dispatch.pushSent) result.remindersSent++;
      else result.remindersDeduped++;
      if (dispatch.whatsappSent) result.whatsappSent++;

      // ── Day 0: try auto-charge if eligible ──
      if (
        daysUntil === 0 &&
        tenant.auto_renew_enabled &&
        tenant.default_payment_method_id
      ) {
        const method = await prisma.tenantPaymentMethod.findUnique({
          where: { id: tenant.default_payment_method_id },
        });
        if (method && method.is_active && method.failure_count < 3) {
          const gw: GatewayName =
            method.gateway === 'zain_cash'
              ? 'zaincash'
              : method.gateway === 'qi_card'
                ? 'qi'
                : 'asiapay';

          // For now, generate fresh checkout URL even with saved method.
          // TODO: implement true tokenized recurring charge.
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
          await initiateCheckout({
            tenantId: tenant.id,
            planId: tenant.plan,
            periodMonths: 1,
            gateway: gw,
            successUrl: `${baseUrl}/staff/billing?status=success`,
            failureUrl: `${baseUrl}/staff/billing?status=failed`,
            isAutoRenewal: true,
            paymentMethodId: method.id,
          });
          result.autoChargeAttempts++;
        }
      }
    } catch (err) {
      result.errors.push({
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[billing-auto-renew] tenant=${tenant.id} failed:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    ...result,
  });
}
