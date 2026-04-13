// Generates a sequential invoice number per tenant + year.
//
// Previously we called a Postgres stored function
// generate_invoice_number(tenant, year) that depended on an
// invoice_sequences table. That table was never declared in the
// Prisma schema, so production DBs don't have it, and every call
// failed with:
//
//   Raw query failed. Code: 42P01. Message: relation
//   "invoice_sequences" does not exist
//
// Worse: a try/catch around $queryRaw is not enough, because any
// failed statement inside a Postgres transaction aborts the whole
// transaction, so every subsequent query in the same Step 2
// transaction fails with "current transaction is aborted" until
// the tx is rolled back. The catch did NOT rescue the transaction.
//
// Fix: stop calling the stored function entirely. Use a pure
// Prisma count to build the number. Deterministic, portable, no
// DB migration, and safe inside a transaction because nothing can
// abort.
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
  const count = await tx.invoice.count({
    where: {
      tenant_id: tenantId,
      billing_year: year,
    },
  })
  const seq = (count + 1).toString().padStart(6, '0')
  return `INV-${year}-${seq}`
}
