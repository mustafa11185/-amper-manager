import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PLAN_LIMITS: Record<string, any> = {
  starter:   { max_subscribers: 25,    max_staff: 1,   max_branches: 1,  online_payment: false, financial_reports: false, custom_app: false, announcements: false, advanced_reports: false, api_access: false, white_label: false, price_iqd: 0 },
  pro:       { max_subscribers: 100,   max_staff: 3,   max_branches: 2,  online_payment: true,  financial_reports: true,  custom_app: false, announcements: true,  advanced_reports: false, api_access: false, white_label: false, price_iqd: 20000 },
  business:  { max_subscribers: 300,   max_staff: 10,  max_branches: 5,  online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: false, white_label: false, price_iqd: 30000 },
  corporate: { max_subscribers: 1000,  max_staff: 25,  max_branches: 15, online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: true,  white_label: false, price_iqd: 50000 },
  fleet:     { max_subscribers: 99999, max_staff: 999, max_branches: 999,online_payment: true,  financial_reports: true,  custom_app: true,  announcements: true,  advanced_reports: true,  api_access: true,  white_label: true,  price_iqd: 0 },
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const plans = await prisma.$queryRaw`
    SELECT * FROM tenant_plans WHERE tenant_id = ${user.tenantId} LIMIT 1
  ` as any[]

  const plan = plans[0] ?? { plan_name: 'starter' }
  const limits = PLAN_LIMITS[plan.plan_name] ?? PLAN_LIMITS.starter

  return NextResponse.json({
    plan_name: plan.plan_name,
    expires_at: plan.expires_at,
    is_active: plan.is_active ?? true,
    limits: {
      ...limits,
      max_subscribers: plan.max_subscribers ?? limits.max_subscribers,
      max_staff: plan.max_staff ?? limits.max_staff,
      max_branches: plan.max_branches ?? limits.max_branches,
    },
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { plan_name, expires_at } = await req.json()
  if (!PLAN_LIMITS[plan_name]) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const l = PLAN_LIMITS[plan_name]
  const exp = expires_at ? new Date(expires_at) : null

  await prisma.$executeRaw`
    INSERT INTO tenant_plans (tenant_id, plan_name, max_subscribers, max_staff, max_branches,
      online_payment, financial_reports, custom_app, announcements,
      advanced_reports, api_access, white_label, price_iqd, expires_at, updated_at)
    VALUES (${user.tenantId}, ${plan_name}, ${l.max_subscribers}, ${l.max_staff}, ${l.max_branches},
      ${l.online_payment}, ${l.financial_reports}, ${l.custom_app}, ${l.announcements},
      ${l.advanced_reports}, ${l.api_access}, ${l.white_label}, ${l.price_iqd}, ${exp}, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan_name = EXCLUDED.plan_name, max_subscribers = EXCLUDED.max_subscribers,
      max_staff = EXCLUDED.max_staff, max_branches = EXCLUDED.max_branches,
      online_payment = EXCLUDED.online_payment, financial_reports = EXCLUDED.financial_reports,
      custom_app = EXCLUDED.custom_app, announcements = EXCLUDED.announcements,
      advanced_reports = EXCLUDED.advanced_reports, api_access = EXCLUDED.api_access,
      white_label = EXCLUDED.white_label, price_iqd = EXCLUDED.price_iqd,
      expires_at = EXCLUDED.expires_at, updated_at = NOW()
  `

  return NextResponse.json({ ok: true, plan_name, limits: l })
}
