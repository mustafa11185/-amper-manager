/**
 * Initiate a SaaS subscription payment for a tenant.
 *
 * Flow:
 *   1. Look up plan + tenant
 *   2. Create BillingInvoice (pending) + SaasOnlinePayment (initiated)
 *   3. Call gateway.initiate() to get redirect URL
 *   4. Update payment with gateway_txn_id + redirect_url
 *   5. Return redirect URL to frontend
 *
 * Webhook flow handled separately in `webhook.ts`.
 */

import { prisma } from '@/lib/prisma';
import { getAmperGateway, libGatewayToDb } from './gateway';
import { priceForPeriod, formatInvoiceNumber, computePeriodEnd, type PeriodMonths } from './period';
import type { GatewayName } from '@/lib/payments/types';
import type { Prisma } from '@prisma/client';

export interface CheckoutInput {
  tenantId: string;
  planId: string;
  periodMonths: PeriodMonths;
  gateway: GatewayName;
  /** Public URL the gateway will redirect to on success (ours, not gateway's). */
  successUrl: string;
  /** Public URL the gateway will redirect to on failure. */
  failureUrl: string;
  language?: 'en' | 'ar' | 'ku';
  /** When triggered by cron auto-renew, suppresses redirect (uses saved payment method). */
  isAutoRenewal?: boolean;
  paymentMethodId?: string;
}

export interface CheckoutResult {
  invoiceId: string;
  paymentId: string;
  redirectUrl: string;
  amount: number;
  gatewayTxnId: string;
}

export async function initiateCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const { tenantId, planId, periodMonths, gateway } = input;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, phone: true, plan: true, subscription_ends_at: true },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.is_active) throw new Error('PLAN_NOT_FOUND_OR_INACTIVE');

  const amount = priceForPeriod(plan, periodMonths);
  if (amount <= 0) throw new Error('INVALID_PRICE');

  // Period boundaries: if tenant has active subscription, extend from current end;
  // else start from now.
  const now = new Date();
  const periodStart =
    tenant.subscription_ends_at && tenant.subscription_ends_at > now
      ? new Date(tenant.subscription_ends_at)
      : now;
  const periodEnd = computePeriodEnd(periodStart, periodMonths);

  // Sequence # for invoice_number — month-based simple counter.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthInvoiceCount = await prisma.billingInvoice.count({
    where: { created_at: { gte: monthStart, lt: monthEnd } },
  });
  const invoiceNumber = formatInvoiceNumber(monthInvoiceCount + 1, now);

  // Create invoice + payment in single transaction so partial state is impossible.
  const { invoice, payment } = await prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.create({
      data: {
        tenant_id: tenantId,
        amount: amount as unknown as Prisma.Decimal,
        final_amount: amount as unknown as Prisma.Decimal,
        plan: planId as 'starter' | 'pro' | 'business' | 'corporate' | 'fleet' | 'basic' | 'gold' | 'custom' | 'trial',
        period_months: periodMonths,
        period_start: periodStart,
        period_end: periodEnd,
        invoice_number: invoiceNumber,
        is_paid: false,
      },
    });

    const payment = await tx.saasOnlinePayment.create({
      data: {
        tenant_id: tenantId,
        invoice_id: invoice.id,
        payment_method_id: input.paymentMethodId,
        gateway: libGatewayToDb(gateway),
        amount: amount as unknown as Prisma.Decimal,
        currency: 'IQD',
        status: 'initiated',
        is_auto_renewal: !!input.isAutoRenewal,
      },
    });

    return { invoice, payment };
  });

  // Call gateway to get redirect URL.
  const adapter = await getAmperGateway(gateway);
  const result = await adapter.initiate({
    externalRef: payment.id, // our payment id is the idempotency key
    orderId: invoice.id,
    amountIqd: amount,
    customerPhone: tenant.phone,
    successUrl: input.successUrl,
    failureUrl: input.failureUrl,
    language: input.language ?? 'ar',
    serviceType: 'AMPER_SAAS_SUBSCRIPTION',
  });

  // Persist gateway txn id + redirect URL so we can reconcile later.
  await prisma.saasOnlinePayment.update({
    where: { id: payment.id },
    data: {
      gateway_txn_id: result.gatewayTxId,
      redirect_url: result.redirectUrl,
      status: 'pending',
    },
  });

  return {
    invoiceId: invoice.id,
    paymentId: payment.id,
    redirectUrl: result.redirectUrl,
    amount,
    gatewayTxnId: result.gatewayTxId,
  };
}
