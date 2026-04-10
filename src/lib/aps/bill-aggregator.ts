// Bill aggregation logic for APS Fawateer-E
//
// CRITICAL RULE from spec: "Bill pull process for an existing bill will result in
// REPLACING that bill, not adding... biller should do the AGGREGATION and send the
// new amount."
//
// So when APS asks for a bill, we must return ONE total amount that includes:
//   - Current month's outstanding invoice
//   - All accumulated debt from past months (subscriber.total_debt)
//   - Minus any partial payments already received

import { prisma } from '@/lib/prisma'
import { apsTimestamp, apsDate } from './xml'

export interface AggregatedBill {
  found: boolean
  notFoundReason?: string
  subscriber?: {
    id: string
    name: string
    serial_number: string
    biller_account_no: string
    tenant_id: string
    branch_id: string
  }
  tenant?: {
    aps_biller_code: string
    aps_service_type: string
  }
  bill?: {
    BillingNo: string
    BillNo: string
    BillerCode: string
    BillStatus: 'BillNew' | 'BillUpdated'
    DueAmount: number
    IssueDate: string
    DueDate: string
    CloseDate: string
    ServiceType: string
    AllowPart: boolean
    Lower: number
    Upper: number
  }
}

/**
 * Look up a subscriber by their global biller_account_no and aggregate
 * all unpaid amounts into a single bill response.
 */
export async function aggregateBillForBilling(
  billingNo: string,
  serviceType: string
): Promise<AggregatedBill> {
  // 1. Find the subscriber (this is global lookup — biller_account_no is unique)
  const subscriber = await prisma.subscriber.findUnique({
    where: { biller_account_no: billingNo },
    include: {
      // Get all unpaid invoices (current + past)
      invoices: {
        where: { is_fully_paid: false, is_reversed: false },
        orderBy: [{ billing_year: 'desc' }, { billing_month: 'desc' }],
      },
    },
  })

  if (!subscriber) {
    return { found: false, notFoundReason: 'subscriber_not_found' }
  }

  if (!subscriber.is_active) {
    return { found: false, notFoundReason: 'inactive_subscriber' }
  }

  // 2. Verify tenant has APS enabled and the service type matches
  const tenant = await prisma.tenant.findUnique({
    where: { id: subscriber.tenant_id },
    select: {
      aps_enabled: true,
      aps_biller_code: true,
      aps_service_type: true,
    },
  })

  if (!tenant?.aps_enabled) {
    return { found: false, notFoundReason: 'aps_not_enabled' }
  }
  if (!tenant.aps_biller_code || !tenant.aps_service_type) {
    return { found: false, notFoundReason: 'aps_not_configured' }
  }
  if (tenant.aps_service_type !== serviceType) {
    return { found: false, notFoundReason: 'service_type_mismatch' }
  }

  // 3. Aggregate the bill amount
  //    = sum of (total_amount_due - amount_paid) for all unpaid invoices
  //    + subscriber.total_debt (legacy debt not yet rolled into invoices)
  let totalDue = 0
  for (const inv of subscriber.invoices) {
    const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
    if (remaining > 0) totalDue += remaining
  }
  totalDue += Number(subscriber.total_debt)

  // Round to whole IQD (no fractions for Iraqi dinar)
  totalDue = Math.round(totalDue)

  if (totalDue < 1) {
    return { found: false, notFoundReason: 'no_due_amount' }
  }

  // 4. Build the bill response
  const now = new Date()
  // Issue date = today (when we generated this aggregated bill)
  const issueDate = apsTimestamp(now)
  // Due date = end of next month (gives the customer time)
  const dueDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59)
  // Close date = 30 days after due date (after which the bill expires from APS)
  const closeDate = new Date(dueDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  return {
    found: true,
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      serial_number: subscriber.serial_number,
      biller_account_no: subscriber.biller_account_no!,
      tenant_id: subscriber.tenant_id,
      branch_id: subscriber.branch_id,
    },
    tenant: {
      aps_biller_code: tenant.aps_biller_code,
      aps_service_type: tenant.aps_service_type,
    },
    bill: {
      BillingNo: billingNo,
      BillNo: billingNo,                   // Per spec: BillNo MUST equal BillingNo
      BillerCode: tenant.aps_biller_code,
      BillStatus: 'BillNew',
      DueAmount: totalDue,
      IssueDate: issueDate,
      DueDate: apsTimestamp(dueDate),
      CloseDate: apsTimestamp(closeDate),
      ServiceType: serviceType,
      // Allow partial payment so customers can pay what they can
      AllowPart: true,
      Lower: 1000,                         // Minimum payment 1,000 IQD
      Upper: totalDue,                     // Cannot pay more than total
    },
  }
}

/**
 * Apply a successful APS payment to the subscriber's invoices and debt.
 * Pays oldest unpaid invoices first (FIFO), then reduces total_debt.
 *
 * Idempotent: if joebpps_trx is already in the DB, skip.
 */
export async function applyApsPayment(opts: {
  billingNo: string
  joebppsTrx: string
  bankTrxId: string
  bankCode: string
  paidAmount: number
  feesAmount: number
  feesOnBiller: boolean
  processDate: Date
  stmtDate: Date
  serviceType: string
  accessChannel: string
  paymentMethod: string
  paymentType?: string
  rawPayload: any
}): Promise<{
  ok: boolean
  errorCode?: string
  errorMessage?: string
  apsTransactionId?: string
}> {
  // 1. Idempotency check
  const existing = await prisma.apsTransaction.findUnique({
    where: { joebpps_trx: opts.joebppsTrx },
  })
  if (existing) {
    // Already processed — return success (per APS retry semantics)
    return { ok: true, apsTransactionId: existing.id }
  }

  // 2. Find the subscriber
  const subscriber = await prisma.subscriber.findUnique({
    where: { biller_account_no: opts.billingNo },
    include: {
      invoices: {
        where: { is_fully_paid: false, is_reversed: false },
        orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
      },
    },
  })
  if (!subscriber) {
    return { ok: false, errorCode: '310', errorMessage: 'Subscriber not found for billing number' }
  }

  // 3. Apply payment in a transaction
  let appliedInvoiceId: string | null = null
  let remaining = opts.paidAmount

  await prisma.$transaction(async (tx) => {
    // Pay oldest invoices first
    for (const inv of subscriber.invoices) {
      if (remaining <= 0) break
      const invRemaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
      if (invRemaining <= 0) continue

      const payAmount = Math.min(remaining, invRemaining)
      const newPaid = Number(inv.amount_paid) + payAmount
      const isFullyPaid = newPaid >= Number(inv.total_amount_due)

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          amount_paid: newPaid,
          is_fully_paid: isFullyPaid,
          payment_method: 'aps_fawateer',
          aps_bank_trx_id: opts.bankTrxId,
          aps_joebpps_trx: opts.joebppsTrx,
          updated_at: new Date(),
        },
      })
      if (!appliedInvoiceId) appliedInvoiceId = inv.id
      remaining -= payAmount
    }

    // Any remainder reduces the legacy debt
    if (remaining > 0 && Number(subscriber.total_debt) > 0) {
      const debtPayment = Math.min(remaining, Number(subscriber.total_debt))
      await tx.subscriber.update({
        where: { id: subscriber.id },
        data: { total_debt: { decrement: debtPayment } },
      })
      remaining -= debtPayment
    }
  })

  // 4. Record the APS transaction (audit log)
  const apsTrx = await prisma.apsTransaction.create({
    data: {
      tenant_id: subscriber.tenant_id,
      joebpps_trx: opts.joebppsTrx,
      bank_trx_id: opts.bankTrxId,
      bank_code: opts.bankCode,
      billing_no: opts.billingNo,
      bill_no: opts.billingNo,
      service_type: opts.serviceType,
      paid_amount: opts.paidAmount,
      due_amount: opts.paidAmount,
      fees_amount: opts.feesAmount,
      fees_on_biller: opts.feesOnBiller,
      process_date: opts.processDate,
      stmt_date: opts.stmtDate,
      access_channel: opts.accessChannel,
      payment_method: opts.paymentMethod,
      payment_type: opts.paymentType ?? null,
      subscriber_id: subscriber.id,
      invoice_id: appliedInvoiceId,
      status: 'applied',
      raw_payload: opts.rawPayload,
      applied_at: new Date(),
    },
  })

  // 5. Create a notification for the manager
  await prisma.notification.create({
    data: {
      tenant_id: subscriber.tenant_id,
      branch_id: subscriber.branch_id,
      type: 'aps_payment_received',
      title: '💳 دفعة عبر APS Fawateer-E',
      body: `${subscriber.name}: ${opts.paidAmount.toLocaleString('ar-IQ')} د.ع عبر ${opts.accessChannel}`,
      payload: {
        subscriber_id: subscriber.id,
        amount: opts.paidAmount,
        channel: opts.accessChannel,
      },
    },
  })

  return { ok: true, apsTransactionId: apsTrx.id }
}

export { apsDate }
