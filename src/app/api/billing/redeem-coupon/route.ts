/**
 * POST /api/billing/redeem-coupon
 *
 * Preview a coupon for a (planId, periodMonths) pair. Doesn't reserve or apply —
 * just returns whether it's valid + the discount amount. The actual reservation
 * happens at checkout time.
 *
 * Body: { code, planId, periodMonths }
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { previewCoupon, priceForPeriod } from '@/lib/saas-billing';
import type { PeriodMonths } from '@/lib/saas-billing';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const code: string = (body.code || '').toString();
  const planId: string = body.planId;
  const periodMonths: number = body.periodMonths;

  if (!code) return NextResponse.json({ error: 'MISSING_CODE' }, { status: 400 });
  if (!planId) return NextResponse.json({ error: 'MISSING_PLAN' }, { status: 400 });
  if (![1, 3, 6, 12].includes(periodMonths)) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });

  const baseAmount = priceForPeriod(plan, periodMonths as PeriodMonths);
  const result = await previewCoupon({ code, planId, baseAmount });

  return NextResponse.json({
    ...result,
    base_amount: baseAmount,
  });
}
