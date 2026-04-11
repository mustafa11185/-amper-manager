import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PLAN_LIMITS: Record<string, any> = {
  starter:   { max_subscribers: 25,    max_staff: 1,   max_branches: 1,  online_payment: false, financial_reports: false, custom_app: false, announcements: false, advanced_reports: false, api_access: false, white_label: false, price_iqd: 0 },
  pro:       { max_subscribers: 100,   max_staff: 3,   max_branches: 2,  online_payment: true,  financial_reports: true,  custom_app: false, announcements: true,  advanced_reports: false, api_access: false, white_label: false, price_iqd: 20000 },
  business:  { max_subscribers: 300,   max_staff: 10,  max_branches: 5,  online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: false, white_label: false, price_iqd: 30000 },
  corporate: { max_subscribers: 1000,  max_staff: 25,  max_branches: 15, online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: true,  white_label: false, price_iqd: 50000 },
  fleet:     { max_subscribers: 99999, max_staff: 9999,max_branches: 9999,online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: true,  white_label: true,  price_iqd: 0 },
  // Old plan mappings
  trial:     { max_subscribers: 25,    max_staff: 1,   max_branches: 1,  online_payment: false, financial_reports: false, custom_app: false, announcements: false, advanced_reports: false, api_access: false, white_label: false, price_iqd: 0 },
  basic:     { max_subscribers: 100,   max_staff: 3,   max_branches: 2,  online_payment: true,  financial_reports: true,  custom_app: false, announcements: false, advanced_reports: false, api_access: false, white_label: false, price_iqd: 15000 },
  gold:      { max_subscribers: 400,   max_staff: 10,  max_branches: 5,  online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: false, white_label: false, price_iqd: 35000 },
}

const PLAN_NAME_MAP: Record<string, string> = {
  trial: 'starter', basic: 'pro', gold: 'business',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId

  try {
    // Defensive 2-stage fetch:
    // Stage 1: try to get plan + new fields. If production DB is missing the
    //          new columns, Prisma throws — we fall back to stage 2.
    // Stage 2: fetch only `plan` (which always exists) — guarantees the user
    //          gets the correct plan even if trial/overrides aren't supported yet.
    let tenant: {
      plan: string
      feature_overrides?: string[]
      trial_plan?: string | null
      trial_plan_until?: Date | null
      has_used_trial?: boolean
    } | null = null

    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          plan: true,
          feature_overrides: true,
          trial_plan: true,
          trial_plan_until: true,
          has_used_trial: true,
        },
      }) as any
    } catch (err: any) {
      console.warn('[plan] Stage 1 failed, falling back to plan-only:', err.message)
      try {
        const minimal = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { plan: true },
        })
        if (minimal) tenant = { plan: minimal.plan as any }
      } catch (err2: any) {
        console.error('[plan] Stage 2 also failed:', err2.message)
      }
    }

    const rawPlan = (tenant?.plan ?? 'starter').toLowerCase()
    let planName = PLAN_NAME_MAP[rawPlan] ?? rawPlan

    // Trial active? Promote to trial plan
    const trialActive = !!(tenant?.trial_plan && tenant?.trial_plan_until && tenant.trial_plan_until > new Date())
    if (trialActive && tenant?.trial_plan) {
      planName = tenant.trial_plan.toLowerCase()
    }

    const limits = PLAN_LIMITS[planName] ?? PLAN_LIMITS.starter

    // Check tenant_plans for overrides (graceful if table missing)
    let ov: any = null
    try {
      const overrides = await prisma.$queryRaw`
        SELECT * FROM tenant_plans WHERE tenant_id = ${tenantId} LIMIT 1
      ` as any[]
      ov = overrides[0] ?? null
    } catch (err: any) {
      console.warn('[plan] tenant_plans lookup failed:', err.message)
    }

    return NextResponse.json({
      plan_name: planName,
      original_plan: rawPlan,
      expires_at: ov?.expires_at ?? null,
      is_active: ov?.is_active ?? true,
      // À-la-carte feature overrides (force-enabled by admin)
      feature_overrides: tenant?.feature_overrides ?? [],
      // Free trial info
      trial_active: trialActive,
      trial_plan: tenant?.trial_plan ?? null,
      trial_plan_until: tenant?.trial_plan_until ?? null,
      has_used_trial: tenant?.has_used_trial ?? false,
      limits: {
        max_subscribers: ov?.max_subscribers ?? limits.max_subscribers,
        max_staff: ov?.max_staff ?? limits.max_staff,
        max_branches: ov?.max_branches ?? limits.max_branches,
        online_payment: ov?.online_payment ?? limits.online_payment,
        financial_reports: ov?.financial_reports ?? limits.financial_reports,
        custom_app: ov?.custom_app ?? limits.custom_app,
        announcements: ov?.announcements ?? limits.announcements,
        advanced_reports: ov?.advanced_reports ?? limits.advanced_reports,
        api_access: ov?.api_access ?? limits.api_access,
        white_label: ov?.white_label ?? limits.white_label,
        price_iqd: limits.price_iqd,
      },
    })
  } catch (e: any) {
    console.error('[plan] fatal error, returning starter as fallback:', e.message)
    // Even on fatal error, return SOMETHING — never starve the client.
    return NextResponse.json({
      plan_name: 'starter',
      original_plan: 'starter',
      expires_at: null,
      is_active: true,
      feature_overrides: [],
      trial_active: false,
      trial_plan: null,
      trial_plan_until: null,
      has_used_trial: false,
      limits: PLAN_LIMITS.starter,
      _error: e.message,
    })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { plan_name } = await req.json()
  if (!PLAN_LIMITS[plan_name]) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const l = PLAN_LIMITS[plan_name]

  // Update tenants.plan
  await prisma.tenant.update({ where: { id: user.tenantId }, data: { plan: plan_name } })

  // Update tenant_plans
  await prisma.$executeRaw`
    INSERT INTO tenant_plans (tenant_id, plan_name, max_subscribers, max_staff, max_branches,
      online_payment, financial_reports, custom_app, announcements,
      advanced_reports, api_access, white_label, price_iqd, updated_at)
    VALUES (${user.tenantId}, ${plan_name}, ${l.max_subscribers}, ${l.max_staff}, ${l.max_branches},
      ${l.online_payment}, ${l.financial_reports}, ${l.custom_app}, ${l.announcements},
      ${l.advanced_reports}, ${l.api_access}, ${l.white_label}, ${l.price_iqd}, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_name = EXCLUDED.plan_name, max_subscribers = EXCLUDED.max_subscribers,
      max_staff = EXCLUDED.max_staff, max_branches = EXCLUDED.max_branches,
      online_payment = EXCLUDED.online_payment, financial_reports = EXCLUDED.financial_reports,
      custom_app = EXCLUDED.custom_app, announcements = EXCLUDED.announcements,
      advanced_reports = EXCLUDED.advanced_reports, api_access = EXCLUDED.api_access,
      white_label = EXCLUDED.white_label, price_iqd = EXCLUDED.price_iqd, updated_at = NOW()
  `

  return NextResponse.json({ ok: true, plan_name })
}
