export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Plan base prices in IQD/month — kept in sync with the rest of the
// platform (manager-app/api/plan, company-admin/api/plans, plan_limits.dart).
const PRICE_PER_MONTH: Record<string, number> = {
  starter: 0, trial: 0,
  pro: 22000, basic: 22000,
  business: 35000, gold: 35000,
  corporate: 55000,
  fleet: 0, custom: 0,
}

// GET /api/subscription
// One-stop endpoint for the manager's "My Plan" screen. Returns:
//   • current plan + price + status
//   • subscription dates + days remaining + billing period inferred from
//     the gap between started_at and ends_at
//   • total paid + last payment + next unpaid invoice
//   • payment history (last 12)
//   • plan change history (last 5)
//   • contact info for the Amper team
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // Defensive select — same pattern used elsewhere to survive schema drift
  let tenant: any = null
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, plan: true, is_active: true, is_trial: true,
        trial_ends_at: true, subscription_ends_at: true,
        is_in_grace_period: true, grace_period_ends_at: true,
        locked_at: true, created_at: true, owner_name: true, phone: true,
      },
    })
  } catch (err: any) {
    console.warn('[subscription] tenant lookup failed:', err.message)
  }
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

  const planKey = (tenant.plan ?? 'starter').toString().toLowerCase()
  const monthly = PRICE_PER_MONTH[planKey] ?? 0

  // ─── Subscription window ─────────────────────────────────
  const now = new Date()
  const expiry: Date | null = tenant.is_trial ? tenant.trial_ends_at : tenant.subscription_ends_at
  const startedAt: Date = tenant.created_at
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - now.getTime()) / 86_400_000) : null
  const isExpired = expiry ? new Date(expiry) < now : false

  // Infer billing period from the gap. We default to 3 months because
  // that's the new platform minimum.
  let billingPeriod: 'quarterly' | 'biannual' | 'annual' | 'unknown' = 'quarterly'
  let billingMonths = 3
  if (expiry) {
    const days = Math.round(
      (new Date(expiry).getTime() - new Date(startedAt).getTime()) / 86_400_000
    )
    if (days >= 330) { billingPeriod = 'annual'; billingMonths = 12 }
    else if (days >= 165) { billingPeriod = 'biannual'; billingMonths = 6 }
    else if (days >= 80) { billingPeriod = 'quarterly'; billingMonths = 3 }
    else billingPeriod = 'unknown'
  }

  // ─── Billing invoices (history + current) ────────────────
  let invoices: any[] = []
  let totalPaid = 0
  let lastPaidAt: Date | null = null
  let lastPaidAmount = 0
  let nextDue: any = null
  try {
    invoices = await prisma.billingInvoice.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 12,
    })
    for (const inv of invoices) {
      if (inv.is_paid) {
        totalPaid += Number(inv.final_amount)
        if (!lastPaidAt || (inv.paid_at && inv.paid_at > lastPaidAt)) {
          lastPaidAt = inv.paid_at
          lastPaidAmount = Number(inv.final_amount)
        }
      } else if (!nextDue) {
        // First unpaid invoice (most recent unpaid)
        nextDue = {
          id: inv.id,
          amount: Number(inv.final_amount),
          period_start: inv.period_start,
          period_end: inv.period_end,
          plan: inv.plan,
        }
      }
    }
  } catch (err: any) {
    console.warn('[subscription] billing lookup failed:', err.message)
  }

  // ─── Plan change history ─────────────────────────────────
  let changes: any[] = []
  try {
    changes = await prisma.planChangeLog.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 5,
    })
  } catch (err: any) {
    console.warn('[subscription] plan changes lookup failed:', err.message)
  }

  // Estimated cost of one renewal cycle (used for the "next renewal" banner)
  const discount = billingPeriod === 'annual' ? 0.15 : billingPeriod === 'biannual' ? 0.05 : 0
  const renewalTotal = monthly === 0 ? 0 : Math.round(monthly * billingMonths * (1 - discount))

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      owner_name: tenant.owner_name,
      phone: tenant.phone,
    },
    plan: {
      key: planKey,
      monthly_price: monthly,
      is_trial: tenant.is_trial,
    },
    status: {
      is_active: tenant.is_active,
      is_in_grace_period: tenant.is_in_grace_period,
      grace_period_ends_at: tenant.grace_period_ends_at,
      locked_at: tenant.locked_at,
      is_expired: isExpired,
    },
    subscription: {
      started_at: startedAt,
      expires_at: expiry,
      days_left: daysLeft,
      billing_period: billingPeriod,
      billing_months: billingMonths,
      renewal_total: renewalTotal,
    },
    payments: {
      total_paid: totalPaid,
      last_paid_at: lastPaidAt,
      last_paid_amount: lastPaidAmount,
      next_due: nextDue,
      invoices: invoices.map(inv => ({
        id: inv.id,
        amount: Number(inv.final_amount),
        is_paid: inv.is_paid,
        paid_at: inv.paid_at,
        period_start: inv.period_start,
        period_end: inv.period_end,
        plan: inv.plan,
        created_at: inv.created_at,
      })),
    },
    plan_history: changes.map(c => ({
      id: c.id,
      from_plan: c.from_plan,
      to_plan: c.to_plan,
      change_type: c.change_type,
      notes: c.notes,
      created_at: c.created_at,
    })),
    // Amper team contact — owner can wire this to a real CMS later.
    contact: {
      whatsapp: '9647800000000',
      phone: '+9647800000000',
      email: 'support@amper.iq',
    },
  })
}
