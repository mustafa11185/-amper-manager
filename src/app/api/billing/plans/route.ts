/**
 * GET /api/billing/plans
 *
 * Returns the active Plan catalog for display on the pricing page (landing)
 * and the upgrade modal (manager-app). No auth required — public.
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
  });

  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name_en: p.name_en,
      name_ar: p.name_ar,
      tagline_ar: p.tagline_ar,
      tagline_en: p.tagline_en,
      pricing: {
        monthly: p.price_monthly,
        '3m': p.price_3m,
        '6m': p.price_6m,
        '12m': p.price_12m,
      },
      limits: {
        generators: p.generator_limit,
        subscribers: p.subscriber_limit,
        staff: p.staff_limit,
      },
      features: {
        iot: p.has_iot,
        ai: p.has_ai,
        subscriber_app: p.has_subscriber_app,
        api: p.has_api,
        multi_branch: p.has_multi_branch,
        priority_support: p.has_priority_support,
      },
      is_popular: p.is_popular,
    })),
  });
}
