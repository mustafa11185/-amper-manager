// Read-only receipt JSON for a single successful OnlinePayment owned by the
// authenticated subscriber. Used by /portal/receipt/[id] (print-to-PDF page).
//
// OnlinePayment doesn't define direct relations to Subscriber/Invoice/Branch
// in the Prisma schema (only `tenant`), so we fan-out the lookups manually.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cookieStore = await cookies()
  const subId = cookieStore.get('subscriber_id')?.value
  if (!subId) return NextResponse.json({ error: 'غير مسجل' }, { status: 401 })

  const op = await prisma.onlinePayment.findUnique({
    where: { id },
    select: {
      id: true, amount: true, gateway: true, gateway_ref: true, status: true,
      created_at: true, invoice_id: true, subscriber_id: true, tenant_id: true,
    },
  })
  if (!op || op.subscriber_id !== subId || op.status !== 'success') {
    return NextResponse.json({ error: 'الإيصال غير متاح' }, { status: 404 })
  }

  const [subscriber, invoice, tenant] = await Promise.all([
    prisma.subscriber.findUnique({
      where: { id: subId },
      select: {
        name: true, serial_number: true, phone: true,
        branch: { select: { name: true, governorate: true } },
      },
    }),
    op.invoice_id ? prisma.invoice.findUnique({
      where: { id: op.invoice_id },
      select: { billing_month: true, billing_year: true, total_amount_due: true },
    }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: op.tenant_id }, select: { name: true } }),
  ])

  return NextResponse.json({
    id: op.id,
    amount: Number(op.amount),
    gateway: op.gateway,
    gateway_ref: op.gateway_ref,
    created_at: op.created_at.toISOString(),
    subscriber: {
      name: subscriber?.name ?? null,
      serial_number: subscriber?.serial_number ?? null,
      phone: subscriber?.phone ?? null,
    },
    branch: {
      name: subscriber?.branch?.name ?? null,
      governorate: subscriber?.branch?.governorate ?? null,
    },
    tenant: { name: tenant?.name ?? null },
    invoice: invoice
      ? { billing_month: invoice.billing_month, billing_year: invoice.billing_year, total_amount_due: Number(invoice.total_amount_due) }
      : null,
  })
}
