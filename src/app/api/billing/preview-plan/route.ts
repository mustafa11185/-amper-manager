/**
 * GET /api/billing/preview-plan?plan=X
 *
 * Returns downgrade safety check for the authenticated tenant moving to plan X.
 * UI uses this to show warnings BEFORE submit (so user knows what they'll lose).
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPlanDowngrade } from '@/lib/saas-billing';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const targetPlan = req.nextUrl.searchParams.get('plan');
  if (!targetPlan) return NextResponse.json({ error: 'MISSING_PLAN' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { plan: true },
  });
  if (!tenant) return NextResponse.json({ error: 'TENANT_NOT_FOUND' }, { status: 404 });

  const check = await checkPlanDowngrade(user.tenantId, tenant.plan, targetPlan);
  return NextResponse.json(check);
}
