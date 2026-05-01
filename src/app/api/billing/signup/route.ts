/**
 * POST /api/billing/signup
 *
 * Self-serve tenant onboarding. Creates a fresh Tenant + default Branch
 * in trial mode, then immediately initiates checkout for the chosen
 * plan/period (option B: payment intent captured at signup, before
 * the 7-day trial elapses).
 *
 * Flow:
 *   1. Validate input (Iraqi phone, password length, plan exists)
 *   2. Reject if phone already taken
 *   3. Create Tenant (is_trial=true, trial_ends_at = +7 days, plan = chosen)
 *   4. Create default Branch (required by createNotification + many features)
 *   5. Initiate checkout — returns gateway redirect URL
 *   6. Return { ok: true, tenantId, redirectUrl }
 *
 * Public endpoint (no auth) — protected by phone-uniqueness + rate limiting
 * via existing trial-request dedup pattern (24h window).
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { initiateCheckout } from '@/lib/saas-billing';
import type { PeriodMonths } from '@/lib/saas-billing';
import type { GatewayName } from '@/lib/payments/types';

const VALID_PERIODS: PeriodMonths[] = [1, 3, 6, 12];
const VALID_GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay'];

const IRAQI_PHONE = /^(07[3-9]\d{8}|9647[3-9]\d{8})$/;

interface SignupBody {
  business_name: string;
  owner_name: string;
  phone: string;
  password: string;
  governorate?: string;
  district?: string;
  neighborhood?: string;
  landmark?: string;
  plan_id: string;
  period_months: number;
  gateway: string;
}

export async function POST(req: NextRequest) {
  let body: SignupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  // ── Validation ──
  const businessName = (body.business_name || '').trim();
  const ownerName = (body.owner_name || '').trim();
  const phoneRaw = (body.phone || '').replace(/[\s\-()]/g, '');
  const password = body.password || '';
  const governorate = (body.governorate || '').trim() || null;
  const district = (body.district || '').trim() || null;
  const neighborhood = (body.neighborhood || '').trim() || null;
  const landmark = (body.landmark || '').trim() || null;
  // Combine neighborhood + landmark into the Branch.address freeform field.
  // Branch has district_key + address; we don't have a dedicated landmark
  // column, so we encode it as "<neighborhood> — قرب: <landmark>" so the
  // sales team sees both pieces in the admin client-detail view.
  const branchAddress = [
    neighborhood,
    landmark ? `قرب: ${landmark}` : null,
  ].filter(Boolean).join(' — ') || null;
  const planId = body.plan_id;
  const periodMonths = body.period_months;
  const gateway = body.gateway;

  if (!businessName || businessName.length < 2) {
    return NextResponse.json({ error: 'INVALID_BUSINESS_NAME' }, { status: 400 });
  }
  if (!ownerName || ownerName.length < 2) {
    return NextResponse.json({ error: 'INVALID_OWNER_NAME' }, { status: 400 });
  }
  // Normalize first so length/format errors are checked against the canonical
  // 07XXXXXXXXX form regardless of whether the user typed a +964 prefix.
  const phoneNormalized = phoneRaw.startsWith('964') ? '0' + phoneRaw.slice(3) : phoneRaw;
  if (!/^\d+$/.test(phoneNormalized)) {
    return NextResponse.json({ error: 'INVALID_PHONE_DIGITS' }, { status: 400 });
  }
  if (!phoneNormalized.startsWith('07')) {
    return NextResponse.json({ error: 'INVALID_PHONE_PREFIX' }, { status: 400 });
  }
  if (phoneNormalized.length !== 11) {
    return NextResponse.json({ error: 'INVALID_PHONE_LENGTH' }, { status: 400 });
  }
  if (!IRAQI_PHONE.test(phoneNormalized)) {
    // Length + prefix passed, so the third digit is wrong (must be 3-9).
    return NextResponse.json({ error: 'INVALID_PHONE_OPERATOR' }, { status: 400 });
  }
  const phone = phoneNormalized;
  if (password.length < 6) {
    return NextResponse.json({ error: 'PASSWORD_TOO_SHORT' }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(periodMonths as PeriodMonths)) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  if (!VALID_GATEWAYS.includes(gateway as GatewayName)) {
    return NextResponse.json({ error: 'INVALID_GATEWAY' }, { status: 400 });
  }

  // ── First subscription must be monthly (matches /api/billing/checkout rule) ──
  if (periodMonths !== 1) {
    return NextResponse.json(
      { error: 'FIRST_SUBSCRIPTION_MUST_BE_MONTHLY', message: 'الاشتراك الأول لازم يكون شهري — تقدر ترقّي بعدها' },
      { status: 400 },
    );
  }

  // ── Plan must exist and be active ──
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.is_active) {
    return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 400 });
  }

  // ── Phone uniqueness ──
  const existing = await prisma.tenant.findUnique({ where: { phone }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'PHONE_ALREADY_REGISTERED' }, { status: 409 });
  }

  // ── Create tenant + default branch in transaction ──
  const passwordHash = await bcrypt.hash(password, 10);
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { tenant } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: businessName,
        owner_name: ownerName,
        phone,
        password: passwordHash,
        plan: planId as 'starter' | 'pro' | 'business' | 'corporate' | 'fleet' | 'basic' | 'gold' | 'custom' | 'trial',
        is_active: true,
        is_trial: true,
        trial_ends_at: trialEnd,
        auto_renew_enabled: true,
      },
    });

    await tx.branch.create({
      data: {
        tenant_id: tenant.id,
        name: 'الفرع الرئيسي',
        governorate: governorate ?? undefined,
        district_key: district ?? undefined,
        address: branchAddress ?? undefined,
        is_active: true,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        tenant_id: tenant.id,
        event_type: 'trial_started',
        metadata: {
          plan: planId,
          period_months: periodMonths,
          gateway,
          source: 'self_serve_signup',
          trial_ends_at: trialEnd.toISOString(),
        },
      },
    });

    return { tenant };
  });

  // ── Immediately initiate checkout — captures payment method (option B) ──
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
  try {
    const checkout = await initiateCheckout({
      tenantId: tenant.id,
      planId,
      periodMonths: periodMonths as PeriodMonths,
      gateway: gateway as GatewayName,
      successUrl: `${baseUrl}/staff/login?welcome=1&phone=${encodeURIComponent(phone)}`,
      failureUrl: `${baseUrl}/signup?plan=${planId}&period=${periodMonths}&error=payment_failed`,
      language: 'ar',
    });

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      redirectUrl: checkout.redirectUrl,
      amount: checkout.amount,
    });
  } catch (err) {
    // Tenant created but checkout failed — return success so user can retry payment
    // from /staff/billing after logging in.
    const message = err instanceof Error ? err.message : 'CHECKOUT_FAILED';
    console.error('[signup] checkout init failed:', err);
    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      redirectUrl: null,
      checkoutError: message,
      message: 'تم إنشاء الحساب — أكمل الدفع من حسابك',
      loginRedirect: `${baseUrl}/staff/login?welcome=1&phone=${encodeURIComponent(phone)}`,
    });
  }
}
