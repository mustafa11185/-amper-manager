// Collector / cashier daily summary — what the staff member personally
// collected today, broken down by payment method.
//
// Two sources merged into one map keyed by method:
//   - Invoice.payment_method on rows where this staff is the collector
//     (cash, card, zaincash for legacy in-person collections)
//   - OnlinePayment rows whose invoice this staff is the collector of —
//     so subscriber-initiated portal payments still credit the right
//     collector. Includes the new qi/asiapay/zaincash adapters.
//
// Output shape: { by_method: { cash: N, card: N, zaincash: N, qi: N, ... },
//                 total_collected, invoices_count, online_count }
//
// Legacy keys (total_cash, total_zaincash, total_card) are still emitted so
// older clients render correctly while they migrate to by_method.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = user.id as string

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const invoices = await prisma.invoice.findMany({
    where: {
      collector_id: staffId,
      updated_at: { gte: today, lt: tomorrow },
      amount_paid: { gt: 0 },
    },
    select: { id: true, amount_paid: true, payment_method: true },
  })

  // Online payments today that landed on an invoice this staff collected.
  // Restricting by invoice IDs ensures subscriber-initiated portal payments
  // are not attributed to an unrelated collector.
  const invoiceIds = invoices.map(i => i.id)
  const online = invoiceIds.length > 0
    ? await prisma.onlinePayment.findMany({
        where: {
          invoice_id: { in: invoiceIds },
          status: 'success',
          created_at: { gte: today, lt: tomorrow },
        },
        select: { amount: true, gateway: true },
      })
    : []

  const byMethod: Record<string, number> = {}
  function addToMethod(method: string, amount: number) {
    const m = method || 'cash'
    byMethod[m] = (byMethod[m] ?? 0) + amount
  }

  for (const inv of invoices) {
    addToMethod(inv.payment_method ?? 'cash', Number(inv.amount_paid))
  }
  for (const op of online) {
    addToMethod(op.gateway ?? 'unknown', Number(op.amount))
  }

  const totalCollected = Object.values(byMethod).reduce((s, v) => s + v, 0)

  return NextResponse.json({
    by_method: byMethod,
    total_collected: totalCollected,
    invoices_count: invoices.length,
    online_count: online.length,
    // Backward-compat keys for older my-report builds — the dynamic
    // by_method map above is the source of truth.
    total_cash: byMethod.cash ?? 0,
    total_zaincash: byMethod.zaincash ?? 0,
    total_card: (byMethod.card ?? 0) + (byMethod.qi ?? 0) + (byMethod.asiapay ?? 0),
  })
}
