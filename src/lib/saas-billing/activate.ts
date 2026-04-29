/**
 * Activate a tenant subscription after a successful payment.
 *
 * Called by webhook handlers (and by cron auto-renew) once payment is verified.
 * Idempotent — safe to call twice with same payment id.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface ActivationInput {
  paymentId: string;
  /** Verified gateway transaction id from webhook (cross-checked vs DB). */
  gatewayTxnId: string;
  /** Raw webhook body for audit. */
  webhookPayload?: unknown;
}

export interface ActivationResult {
  alreadyProcessed: boolean;
  tenantId: string;
  invoiceId: string;
  newPeriodEnd: Date;
}

export async function activateFromPayment(input: ActivationInput): Promise<ActivationResult> {
  const { paymentId } = input;

  const payment = await prisma.saasOnlinePayment.findUnique({
    where: { id: paymentId },
    include: { invoice: true },
  });
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (!payment.invoice) throw new Error('INVOICE_NOT_LINKED');

  // Idempotency: if already succeeded, return early.
  if (payment.status === 'succeeded') {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: payment.tenant_id },
      select: { subscription_ends_at: true },
    });
    return {
      alreadyProcessed: true,
      tenantId: payment.tenant_id,
      invoiceId: payment.invoice.id,
      newPeriodEnd: tenant.subscription_ends_at ?? payment.invoice.period_end,
    };
  }

  // Verify gateway txn id matches (security — webhook could be forged).
  if (payment.gateway_txn_id && payment.gateway_txn_id !== input.gatewayTxnId) {
    throw new Error('GATEWAY_TXN_MISMATCH');
  }

  const newPeriodEnd = payment.invoice.period_end;
  const planId = payment.invoice.plan;

  await prisma.$transaction(async (tx) => {
    // Mark payment as succeeded
    await tx.saasOnlinePayment.update({
      where: { id: paymentId },
      data: {
        status: 'succeeded',
        completed_at: new Date(),
        webhook_payload: (input.webhookPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Mark invoice as paid
    await tx.billingInvoice.update({
      where: { id: payment.invoice!.id },
      data: {
        is_paid: true,
        paid_at: new Date(),
        saas_payment_id: paymentId,
      },
    });

    // Update tenant subscription
    await tx.tenant.update({
      where: { id: payment.tenant_id },
      data: {
        plan: planId,
        is_active: true,
        is_trial: false,
        trial_ends_at: null,
        subscription_ends_at: newPeriodEnd,
        is_in_grace_period: false,
        grace_period_ends_at: null,
        locked_at: null,
      },
    });

    // Audit event
    await tx.subscriptionEvent.create({
      data: {
        tenant_id: payment.tenant_id,
        event_type: payment.is_auto_renewal ? 'auto_renewed' : 'payment_succeeded',
        metadata: {
          invoice_id: payment.invoice!.id,
          payment_id: paymentId,
          plan: planId,
          period_months: payment.invoice!.period_months,
          amount: payment.amount.toString(),
          gateway: payment.gateway,
        } as Prisma.InputJsonValue,
      },
    });

    // If a payment_method was used, mark it as last-charged
    if (payment.payment_method_id) {
      await tx.tenantPaymentMethod.update({
        where: { id: payment.payment_method_id },
        data: { last_charged_at: new Date(), failure_count: 0 },
      });
    }
  });

  return {
    alreadyProcessed: false,
    tenantId: payment.tenant_id,
    invoiceId: payment.invoice.id,
    newPeriodEnd,
  };
}

/**
 * Called when a payment fails. Records the failure for audit + dunning.
 */
export async function recordPaymentFailure(input: {
  paymentId: string;
  reason: string;
  webhookPayload?: unknown;
}): Promise<void> {
  const payment = await prisma.saasOnlinePayment.findUnique({
    where: { id: input.paymentId },
  });
  if (!payment) return;
  if (payment.status === 'succeeded' || payment.status === 'failed') return;

  await prisma.$transaction(async (tx) => {
    await tx.saasOnlinePayment.update({
      where: { id: input.paymentId },
      data: {
        status: 'failed',
        failure_reason: input.reason.slice(0, 500),
        completed_at: new Date(),
        webhook_payload: (input.webhookPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        tenant_id: payment.tenant_id,
        event_type: 'payment_failed',
        metadata: {
          payment_id: input.paymentId,
          reason: input.reason,
          gateway: payment.gateway,
        } as Prisma.InputJsonValue,
      },
    });

    if (payment.payment_method_id) {
      await tx.tenantPaymentMethod.update({
        where: { id: payment.payment_method_id },
        data: { last_failure_at: new Date(), failure_count: { increment: 1 } },
      });
    }
  });
}
