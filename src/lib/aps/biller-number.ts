// Biller account number generation for APS Fawateer-E
//
// Format: [2-3 digit tenant prefix][6 digit subscriber sequence] = 8-9 digits
// Example: "01000123" = tenant 01, subscriber #000123
//
// This number is GLOBALLY UNIQUE across all Amper tenants — that's how
// APS routes the customer's payment from any ATM back to the right subscriber.

import { prisma } from '@/lib/prisma'

const SUBSCRIBER_SEQUENCE_LENGTH = 6  // up to 999,999 subscribers per tenant

/**
 * Generate the next biller_account_no for a subscriber, given the tenant prefix.
 * Allocates sequentially within a tenant, leaves gaps for resilience.
 */
export async function generateBillerAccountNo(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aps_billing_prefix: true },
  })
  if (!tenant?.aps_billing_prefix) {
    throw new Error('Tenant has no aps_billing_prefix configured')
  }
  const prefix = tenant.aps_billing_prefix

  // Find highest existing biller_account_no with this prefix
  const last = await prisma.subscriber.findFirst({
    where: {
      tenant_id: tenantId,
      biller_account_no: { startsWith: prefix },
    },
    orderBy: { biller_account_no: 'desc' },
    select: { biller_account_no: true },
  })

  let nextSeq = 1
  if (last?.biller_account_no) {
    const seqPart = last.biller_account_no.slice(prefix.length)
    nextSeq = parseInt(seqPart, 10) + 1
  }

  const padded = nextSeq.toString().padStart(SUBSCRIBER_SEQUENCE_LENGTH, '0')
  return `${prefix}${padded}`
}

/**
 * Bulk-assign biller_account_no to all subscribers of a tenant who don't have one yet.
 * Returns the number of subscribers updated.
 */
export async function assignBillerAccountNumbers(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aps_billing_prefix: true },
  })
  if (!tenant?.aps_billing_prefix) {
    throw new Error('Tenant has no aps_billing_prefix configured. Set it first.')
  }

  const subs = await prisma.subscriber.findMany({
    where: {
      tenant_id: tenantId,
      biller_account_no: null,
    },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  })

  if (subs.length === 0) return 0

  // Find current max sequence for this prefix
  const last = await prisma.subscriber.findFirst({
    where: {
      tenant_id: tenantId,
      biller_account_no: { startsWith: tenant.aps_billing_prefix },
    },
    orderBy: { biller_account_no: 'desc' },
    select: { biller_account_no: true },
  })

  let nextSeq = 1
  if (last?.biller_account_no) {
    nextSeq = parseInt(last.biller_account_no.slice(tenant.aps_billing_prefix.length), 10) + 1
  }

  // Update each subscriber with sequential numbers
  for (const sub of subs) {
    const padded = nextSeq.toString().padStart(SUBSCRIBER_SEQUENCE_LENGTH, '0')
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { biller_account_no: `${tenant.aps_billing_prefix}${padded}` },
    })
    nextSeq++
  }

  return subs.length
}
