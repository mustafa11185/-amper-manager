/**
 * GET /api/billing/status
 *
 * Returns the tenant's current subscription state + invoice history.
 * Consumed by the manager-app billing page (`/staff/(app)/billing`).
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string; role?: string } | undefined;
  if (!user?.tenantId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      plan: true,
      is_active: true,
      is_trial: true,
      trial_ends_at: true,
      subscription_ends_at: true,
      grace_period_ends_at: true,
      is_in_grace_period: true,
    },
  });
  if (!tenant) return NextResponse.json({ error: 'TENANT_NOT_FOUND' }, { status: 404 });

  const [outstanding, paid] = await Promise.all([
    prisma.billingInvoice.findMany({
      where: { tenant_id: user.tenantId, is_paid: false },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        invoice_number: true,
        amount: true,
        plan: true,
        period_months: true,
        period_start: true,
        period_end: true,
        created_at: true,
      },
    }),
    prisma.billingInvoice.findMany({
      where: { tenant_id: user.tenantId, is_paid: true },
      orderBy: { paid_at: 'desc' },
      take: 24,
      select: {
        id: true,
        invoice_number: true,
        amount: true,
        plan: true,
        period_months: true,
        paid_at: true,
      },
    }),
  ]);

  const now = new Date();
  const refDate = tenant.subscription_ends_at ?? tenant.trial_ends_at;
  const daysRemaining = refDate
    ? Math.max(0, Math.ceil((refDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return NextResponse.json({
    plan: tenant.plan,
    is_active: tenant.is_active,
    is_trial: tenant.is_trial,
    is_in_grace_period: tenant.is_in_grace_period,
    trial_ends_at: tenant.trial_ends_at,
    subscription_ends_at: tenant.subscription_ends_at,
    grace_period_ends_at: tenant.grace_period_ends_at,
    days_remaining: daysRemaining,
    can_renew_long_term: paid.length > 0, // first-time users get monthly only
    outstanding_invoices: outstanding.map((i) => ({
      ...i,
      amount: Number(i.amount),
    })),
    paid_invoices: paid.map((i) => ({
      ...i,
      amount: Number(i.amount),
    })),
  });
}
