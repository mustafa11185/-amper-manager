/**
 * Shared webhook handler for SaaS subscription payment callbacks.
 *
 * Each gateway has its own route under /api/billing/webhook/{gateway} that
 * imports this and passes its gateway name. Body parsing + signature
 * verification is delegated to the gateway adapter (which knows the format).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAmperGateway, activateFromPayment, recordPaymentFailure } from '@/lib/saas-billing';
import type { GatewayName } from '@/lib/payments/types';

export async function handleWebhook(req: NextRequest, gatewayName: GatewayName) {
  let body: unknown;
  try {
    // ZainCash + Qi send JSON; AsiaPay sends form-encoded — try JSON first.
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (err) {
    console.error(`[webhook/${gatewayName}] body parse failed:`, err);
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  let verified;
  try {
    const gateway = await getAmperGateway(gatewayName);
    verified = await gateway.verifyWebhook(body);
  } catch (err) {
    console.error(`[webhook/${gatewayName}] verify failed:`, err);
    return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 400 });
  }

  // externalRef is our SaasOnlinePayment.id (set during initiate)
  const paymentId = verified.externalRef;

  try {
    if (verified.status === 'success') {
      await activateFromPayment({
        paymentId,
        gatewayTxnId: verified.gatewayTxId,
        webhookPayload: body,
      });
    } else if (
      verified.status === 'failed' ||
      verified.status === 'expired' ||
      verified.status === 'refunded'
    ) {
      await recordPaymentFailure({
        paymentId,
        reason: `gateway_status=${verified.status}`,
        webhookPayload: body,
      });
    } else {
      // pending / unknown — log + acknowledge so gateway stops retrying.
      console.log(`[webhook/${gatewayName}] non-terminal status=${verified.status} payment=${paymentId}`);
    }
  } catch (err) {
    console.error(`[webhook/${gatewayName}] activation failed:`, err);
    // Return 500 so gateway retries. But if we already activated and it's
    // re-firing, activateFromPayment is idempotent and will succeed.
    return NextResponse.json({ error: 'ACTIVATION_FAILED' }, { status: 500 });
  }

  // Most gateways expect 200 OK with simple ack body.
  return NextResponse.json({ ok: true });
}
