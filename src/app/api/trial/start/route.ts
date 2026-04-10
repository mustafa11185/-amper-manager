import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const TRIAL_DAYS = 7
const ALLOWED_TRIAL_PLANS = ['business', 'corporate']  // Plans that can be trialed

// POST /api/trial/start  Body: { plan }
// Starts a 7-day trial of a higher plan. One-time only per tenant.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه بدء التجربة' }, { status: 403 })
  }

  try {
    const { plan } = await req.json()
    if (!plan || !ALLOWED_TRIAL_PLANS.includes(plan)) {
      return NextResponse.json({ error: 'باقة غير صالحة للتجربة' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { has_used_trial: true, plan: true, trial_plan_until: true },
    })
    if (!tenant) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    if (tenant.has_used_trial) {
      return NextResponse.json({ error: 'لقد استخدمت التجربة المجانية مسبقاً' }, { status: 409 })
    }

    // Verify trial plan is HIGHER than current
    const planOrder = ['starter', 'pro', 'business', 'corporate', 'fleet']
    const currentIdx = planOrder.indexOf(tenant.plan.toLowerCase())
    const trialIdx = planOrder.indexOf(plan)
    if (trialIdx <= currentIdx) {
      return NextResponse.json({ error: 'باقتك الحالية أعلى من أو تساوي باقة التجربة' }, { status: 400 })
    }

    const until = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        trial_plan: plan,
        trial_plan_until: until,
        has_used_trial: true,
      },
    })

    return NextResponse.json({
      ok: true,
      trial_plan: plan,
      trial_until: until.toISOString(),
      message: `تم تفعيل تجربة ${plan} لمدة ${TRIAL_DAYS} أيام`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
