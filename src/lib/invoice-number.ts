// Generates a sequential invoice number per tenant + year.
//
// Originally we called a Postgres stored function
// generate_invoice_number(tenant, year) that used an auxiliary
// invoice_sequences table. That table was never checked into the
// Prisma schema, so production databases don't have it, and the
// $queryRaw call fails with code 42P01 ("relation does not
// exist"), which rolls back the entire invoice generation
// transaction — users see "debts rolled but no new invoices".
//
// This helper tries the stored function first (keeps existing
// behavior where it exists), and falls back to a Prisma count so
// the fix works on every deployment without a schema migration.
//
// Format: INV-{YEAR}-{6-digit-zero-padded-sequence}
// Example: INV-2026-000042

import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient | PrismaClient

export async function nextInvoiceNumber(
  tx: Tx,
  tenantId: string,
  year: number,
): Promise<string> {
  // 1) Try the stored function path first.
  try {
    const rows = await tx.$queryRaw<Array<{ num: string | null }>>`
      SELECT generate_invoice_number(${tenantId}::uuid, ${year}::int) AS num
    `
    const n = rows[0]?.num
    if (n) return n
  } catch {
    // swallow — fall through to the Prisma fallback. We don't log at
    // ERROR level because on environments without the stored function
    // this path runs on every invoice and would flood the logs.
  }

  // 2) Fallback — count existing invoices for this tenant + year
  //    and assemble a human-friendly number.
  const count = await tx.invoice.count({
    where: {
      tenant_id: tenantId,
      billing_year: year,
    },
  })
  const seq = (count + 1).toString().padStart(6, '0')
  return `INV-${year}-${seq}`
}
