// Returns the list of payment options the authenticated subscriber can use.
//
// Two sources of truth, merged into a single ordered list:
//   1. New gateway adapters — rows in PaymentGatewayCredentials where
//      is_enabled=true (per-tenant): zaincash | qi | asiapay
//   2. Legacy gateway routing — branch.is_online_payment_enabled +
//      branch.active_gateway / branch.furatpay_enabled (per-branch):
//      aps | furatpay
//
// The portal renders these buttons in order. Empty list = "online payment
// not configured for this tenant" → portal hides the pay tab.
//
// Output shape is intentionally flat so the portal does not need to know
// about gateway internals — each option carries the `gateway` key the
// portal posts back to /api/payment/init.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

type Option = {
  gateway: string          // value to send to /api/payment/init.payment_method
  label: string            // user-facing button label (Arabic)
  sublabel: string         // small descriptor under the label
  badge: 'qi' | 'visa' | 'mastercard' | 'zaincash' | 'asiapay' | 'generic'
  isTestMode: boolean      // true → portal shows "وضع تجريبي"
}

export async function GET() {
  const cookieStore = await cookies()
  const subscriberId = cookieStore.get('subscriber_id')?.value
  if (!subscriberId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Subscriber → branch (for per-branch toggle) + generator → app settings
  // (for per-generator FuratPay opt-in, which is how the legacy flow gates
  // FuratPay visibility per subscriber).
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: {
      tenant_id: true,
      generator_id: true,
    },
  })
  if (!subscriber) return NextResponse.json({ error: 'subscriber_not_found' }, { status: 404 })

  // Single targeted query for the branch's online-payment switches. Done
  // separately because the Subscriber → Branch relation requires an extra
  // include hop and would broaden Prisma's type inference unnecessarily.
  const sub2 = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: {
      branch: {
        select: {
          is_online_payment_enabled: true,
          active_gateway: true,
        },
      },
    },
  })
  const branch = sub2?.branch
  if (!branch?.is_online_payment_enabled) {
    // Branch-level kill switch. If the owner hasn't turned online payment on
    // for this branch, the subscriber sees no options regardless of which
    // gateways the tenant has configured.
    return NextResponse.json({ options: [], reason: 'branch_disabled' })
  }

  // Per-generator FuratPay toggle (legacy field on subscriber_app_settings).
  let perGeneratorFuratpay = false
  if (subscriber.generator_id) {
    const gs = await prisma.subscriberAppSettings.findUnique({
      where: { generator_id: subscriber.generator_id },
      select: { furatpay_enabled: true, online_payment: true },
    })
    if (gs && gs.online_payment === false) {
      // Per-subscriber/per-generator opt-out beats everything else.
      return NextResponse.json({ options: [], reason: 'subscriber_disabled' })
    }
    perGeneratorFuratpay = gs?.furatpay_enabled ?? false
  }

  const options: Option[] = []

  // --- New per-tenant gateway adapters (Qi / AsiaPay / ZainCash) ---
  const creds = await prisma.paymentGatewayCredentials.findMany({
    where: { tenant_id: subscriber.tenant_id, is_enabled: true },
    select: { gateway: true, is_test_mode: true, is_default: true, display_name: true },
    orderBy: [{ is_default: 'desc' }, { gateway: 'asc' }],
  })
  for (const c of creds) {
    if (c.gateway === 'qi') {
      options.push({
        gateway: 'qi',
        label: c.display_name || 'كي كارد / ماستركارد',
        sublabel: 'بطاقة كي العراقية أو ماستركارد',
        badge: 'qi',
        isTestMode: c.is_test_mode,
      })
    } else if (c.gateway === 'asiapay') {
      options.push({
        gateway: 'asiapay',
        label: c.display_name || 'AsiaPay',
        sublabel: 'فيزا / ماستركارد',
        badge: 'asiapay',
        isTestMode: c.is_test_mode,
      })
    } else if (c.gateway === 'zaincash') {
      options.push({
        gateway: 'zaincash',
        label: c.display_name || 'ZainCash',
        sublabel: 'محفظة زين النقدية',
        badge: 'zaincash',
        isTestMode: c.is_test_mode,
      })
    }
  }

  // --- Legacy gateway routing (per-branch) ---
  // The legacy /api/payment/init code path expects payment_method values that
  // are NOT in NEW_GATEWAYS, so we use 'aps' / 'furatpay' here as the
  // gateway key. The init route routes both via createPayment().
  if (branch.active_gateway === 'aps') {
    options.push({
      gateway: 'aps',
      label: 'فيزا / ماستركارد (APS)',
      sublabel: 'بطاقة بنكية دولية',
      badge: 'visa',
      isTestMode: false,
    })
  }
  if (perGeneratorFuratpay) {
    // FuratPay is gated per-generator via SubscriberAppSettings. Branch
    // active_gateway points at FuratPay too in normal setups, but we
    // surface the option whenever the per-subscriber toggle is on so
    // existing tenants don't break.
    options.push({
      gateway: 'furatpay',
      label: 'فيزا / ماستركارد (FuratPay)',
      sublabel: 'بطاقة بنكية',
      badge: 'visa',
      isTestMode: false,
    })
  }

  return NextResponse.json({
    options,
    reason: options.length === 0 ? 'no_gateways_configured' : null,
  })
}
