// Returns the list of payment options the authenticated subscriber can use.
//
// Source of truth: rows in PaymentGatewayCredentials where is_enabled=true
// for this tenant. Each row maps 1:1 to a typed adapter (zaincash | qi |
// asiapay). The portal renders these buttons in order; an empty list means
// "online payment not configured for this tenant" → portal hides the pay tab.
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

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: {
      tenant_id: true,
      generator_id: true,
      branch: { select: { is_online_payment_enabled: true } },
    },
  })
  if (!subscriber) return NextResponse.json({ error: 'subscriber_not_found' }, { status: 404 })

  if (!subscriber.branch?.is_online_payment_enabled) {
    // Per-branch kill switch. If the owner hasn't turned online payment on
    // for this branch, the subscriber sees no options regardless of which
    // gateways the tenant has configured.
    return NextResponse.json({ options: [], reason: 'branch_disabled' })
  }

  // Per-subscriber kill switch (SubscriberAppSettings.online_payment).
  if (subscriber.generator_id) {
    const gs = await prisma.subscriberAppSettings.findUnique({
      where: { generator_id: subscriber.generator_id },
      select: { online_payment: true },
    })
    if (gs && gs.online_payment === false) {
      return NextResponse.json({ options: [], reason: 'subscriber_disabled' })
    }
  }

  const options: Option[] = []
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

  return NextResponse.json({
    options,
    reason: options.length === 0 ? 'no_gateways_configured' : null,
  })
}
