// GET /api/invoices/diagnostic?branch_id=X
//
// Read-only inspection endpoint for owners/managers to see the EXACT
// current state of invoice generation for a branch without running a
// mutation. Used to diagnose "I clicked generate but nothing happened"
// scenarios.
//
// Returns:
//   - active subscriber count
//   - existing invoices for current billing month (count + by state)
//   - unpaid invoices in past months (what would roll to debt)
//   - current pricing (required for generation)
//   - last generation log (reversed or not)
//   - a simulated "what would happen if I click generate right now"
//     summary so the user sees the expected outcome before running

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string; tenantId?: string; branchId?: string }
  const tenantId = user.tenantId
  if (!tenantId) return NextResponse.json({ error: 'no tenant' }, { status: 400 })

  const branch_id = req.nextUrl.searchParams.get('branch_id') || user.branchId
  if (!branch_id) return NextResponse.json({ error: 'branch_id required' }, { status: 400 })

  // Confirm branch belongs to tenant
  const branch = await prisma.branch.findFirst({
    where: { id: branch_id, tenant_id: tenantId },
    select: { id: true, name: true },
  })
  if (!branch) return NextResponse.json({ error: 'branch_not_found' }, { status: 404 })

  const now = new Date()
  const billingMonth = now.getMonth() + 1
  const billingYear = now.getFullYear()

  // Pricing
  const pricing = await prisma.monthlyPricing.findFirst({
    where: { branch_id },
    orderBy: { effective_from: 'desc' },
  })

  // Active subscribers
  const activeSubscribers = await prisma.subscriber.findMany({
    where: { branch_id, is_active: true },
    select: { id: true, amperage: true, subscription_type: true, name: true },
  })

  // Invoices for current billing month (regardless of state)
  const currentMonthInvoices = await prisma.invoice.findMany({
    where: { branch_id, billing_month: billingMonth, billing_year: billingYear },
    select: {
      id: true,
      subscriber_id: true,
      amount_paid: true,
      is_fully_paid: true,
      payment_method: true,
      total_amount_due: true,
    },
  })

  // Unpaid invoices from past months (what WOULD roll to debt)
  const pastUnpaidInvoices = await prisma.invoice.findMany({
    where: {
      branch_id,
      is_fully_paid: false,
      OR: [
        { billing_year: { lt: billingYear } },
        {
          AND: [
            { billing_year: billingYear },
            { billing_month: { lt: billingMonth } },
          ],
        },
      ],
    },
    select: {
      id: true,
      subscriber_id: true,
      billing_month: true,
      billing_year: true,
      total_amount_due: true,
      amount_paid: true,
    },
  })

  // Last generation log
  const lastGenLog = await prisma.invoiceGenerationLog.findFirst({
    where: { branch_id, tenant_id: tenantId },
    orderBy: { generated_at: 'desc' },
  })

  // Classify current-month invoices
  const byState = {
    fully_paid: 0,
    partially_paid: 0,
    unpaid: 0,
    rolled_to_debt: 0,
  }
  const subsWithCurrentInvoice = new Set<string>()
  for (const inv of currentMonthInvoices) {
    subsWithCurrentInvoice.add(inv.subscriber_id)
    if (inv.payment_method === 'rolled_to_debt') {
      byState.rolled_to_debt++
    } else if (inv.is_fully_paid) {
      byState.fully_paid++
    } else if (Number(inv.amount_paid) > 0) {
      byState.partially_paid++
    } else {
      byState.unpaid++
    }
  }

  // Names of active subscribers missing a current-month invoice —
  // this is the fastest way for an owner to see exactly who was
  // skipped so they can decide whether to click "إصدار المتبقين".
  const missingSubscribers = activeSubscribers
    .filter((s) => !subsWithCurrentInvoice.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }))
    .slice(0, 50)

  // Simulate generate
  const priceNormal = pricing ? Number(pricing.price_per_amp_normal) : 0
  const priceGold = pricing ? Number(pricing.price_per_amp_gold) : 0
  let wouldCreate = 0
  let wouldUpdate = 0
  let wouldSkip = 0
  let expectedRevenue = 0

  for (const sub of activeSubscribers) {
    const price = sub.subscription_type === 'gold' ? priceGold : priceNormal
    const due = Math.round(Number(sub.amperage) * price)
    expectedRevenue += due

    const existing = currentMonthInvoices.find((i) => i.subscriber_id === sub.id)
    if (!existing) {
      wouldCreate++
    } else if (Number(existing.amount_paid) > 0 || existing.is_fully_paid) {
      wouldSkip++
    } else {
      wouldUpdate++
    }
  }

  // Debt that would be added
  let wouldRollToDebt = 0
  const debtBySubscriber = new Map<string, number>()
  for (const inv of pastUnpaidInvoices) {
    const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
    if (remaining > 0) {
      debtBySubscriber.set(inv.subscriber_id, (debtBySubscriber.get(inv.subscriber_id) || 0) + remaining)
      wouldRollToDebt += remaining
    }
  }

  // Daily lock check
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const lockedToday = await prisma.invoiceGenerationLog.findFirst({
    where: {
      branch_id,
      is_reversed: false,
      generated_at: { gte: todayStart, lte: todayEnd },
    },
  })

  return NextResponse.json({
    branch: { id: branch.id, name: branch.name },
    now: now.toISOString(),
    billing_period: { month: billingMonth, year: billingYear },
    pricing: pricing
      ? {
          price_per_amp_normal: priceNormal,
          price_per_amp_gold: priceGold,
          effective_from: pricing.effective_from,
        }
      : null,
    active_subscribers: activeSubscribers.length,
    current_month_invoices: {
      total: currentMonthInvoices.length,
      subscribers_with_invoice: subsWithCurrentInvoice.size,
      subscribers_without_invoice: activeSubscribers.length - subsWithCurrentInvoice.size,
      missing_subscribers: missingSubscribers,
      by_state: byState,
    },
    past_unpaid: {
      count: pastUnpaidInvoices.length,
      affected_subscribers: debtBySubscriber.size,
      total_amount: pastUnpaidInvoices.reduce(
        (s, i) => s + Math.max(0, Number(i.total_amount_due) - Number(i.amount_paid)),
        0,
      ),
    },
    simulation: {
      would_create: wouldCreate,
      would_update: wouldUpdate,
      would_skip: wouldSkip,
      would_roll_to_debt_count: debtBySubscriber.size,
      would_roll_to_debt_amount: wouldRollToDebt,
      expected_revenue: expectedRevenue,
      blocked_by_daily_lock: !!lockedToday,
    },
    last_generation_log: lastGenLog
      ? {
          id: lastGenLog.id,
          generated_at: lastGenLog.generated_at,
          invoice_count: lastGenLog.invoice_count,
          debt_count: lastGenLog.debt_count,
          is_reversed: lastGenLog.is_reversed,
          reversed_at: lastGenLog.reversed_at,
          billing_month: lastGenLog.billing_month,
          billing_year: lastGenLog.billing_year,
        }
      : null,
  })
}
