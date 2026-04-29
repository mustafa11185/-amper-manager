/**
 * POST /api/billing/checkout
 *
 * Initiate a SaaS subscription payment. Returns a redirect URL.
 *
 * Body: { planId, periodMonths, gateway }
 *
 * Auth: required (tenant owner via NextAuth session).
 *
 * Business rules:
 *   - First-time subscribers (no prior paid invoices) → only 1-month period allowed
 *   - Returning users → 1, 3, 6, or 12 month periods allowed
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { initiateCheckout, checkPlanDowngrade } from '@/lib/saas-billing';
import type { PeriodMonths } from '@/lib/saas-billing';
import type { GatewayName } from '@/lib/payments/types';

const VALID_PERIODS: PeriodMonths[] = [1, 3, 6, 12];
const VALID_GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string; role?: string } | undefined;
  if (!user?.tenantId || user.role !== 'owner') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const planId: string = body.planId;
  const periodMonths: number = body.periodMonths;
  const gateway: string = body.gateway;

  if (!planId) return NextResponse.json({ error: 'MISSING_PLAN_ID' }, { status: 400 });
  if (!VALID_PERIODS.includes(periodMonths as PeriodMonths)) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  if (!VALID_GATEWAYS.includes(gateway as GatewayName)) {
    return NextResponse.json({ error: 'INVALID_GATEWAY' }, { status: 400 });
  }

  // Enforce first-subscription rule.
  const paidCount = await prisma.billingInvoice.count({
    where: { tenant_id: user.tenantId, is_paid: true },
  });
  if (paidCount === 0 && periodMonths !== 1) {
    return NextResponse.json(
      { error: 'FIRST_SUBSCRIPTION_MUST_BE_MONTHLY' },
      { status: 400 },
    );
  }

  // Block downgrades that would exceed plan limits (over-subscriber, over-staff, etc.).
  // Feature-loss issues are allowed but logged — UI shows them as warnings.
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { plan: true },
  });
  if (tenant && tenant.plan !== planId) {
    const check = await checkPlanDowngrade(user.tenantId, tenant.plan, planId);
    const blockingIssues = check.issues.filter((i) => i.type !== 'feature_lost');
    if (blockingIssues.length > 0 && !body.force) {
      return NextResponse.json({
        error: 'PLAN_LIMITS_EXCEEDED',
        message: 'الباقة الجديدة لا تتسع للاستخدام الحالي',
        issues: check.issues,
        current_usage: check.current_usage,
      }, { status: 409 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

  try {
    const result = await initiateCheckout({
      tenantId: user.tenantId,
      planId,
      periodMonths: periodMonths as PeriodMonths,
      gateway: gateway as GatewayName,
      successUrl: `${baseUrl}/account/billing/success`,
      failureUrl: `${baseUrl}/account/billing/failure`,
      language: 'ar',
    });

    return NextResponse.json({
      ok: true,
      redirectUrl: result.redirectUrl,
      invoiceId: result.invoiceId,
      paymentId: result.paymentId,
      amount: result.amount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
    console.error('[checkout] failed:', err);
    return NextResponse.json({ error: 'CHECKOUT_FAILED', message }, { status: 500 });
  }
}
