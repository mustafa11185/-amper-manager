export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerByToken } from '../login/route'

// Default permissions for a freshly-created partner. The owner can
// flip these from the partner_detail_screen permissions sheet.
const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  view_partners_list: false,
  view_partners_balances: false,
  view_revenue: false,
  view_expenses: false,
  view_subscribers_count: true,
  view_iot_status: false,
  request_withdrawal: false,
  view_reports: false,
}

// Maps each permission to the minimum tenant plan that supports it.
// Permissions that require Corporate or Fleet are silently downgraded
// to false when the owner is on Business — so the same permissions JSON
// can be reused across plans without leaking features.
const PERMISSION_MIN_PLAN: Record<string, 'business' | 'corporate' | 'fleet'> = {
  view_partners_list: 'corporate',
  view_partners_balances: 'corporate',
  view_revenue: 'corporate',
  view_expenses: 'corporate',
  view_subscribers_count: 'business',
  view_iot_status: 'fleet',
  request_withdrawal: 'corporate',
  view_reports: 'corporate',
}

const PLAN_RANK: Record<string, number> = {
  starter: 0, trial: 0, basic: 1, pro: 1,
  business: 2, gold: 2,
  corporate: 3, fleet: 4, custom: 4,
}

function planMeets(currentPlan: string, requiredPlan: string): boolean {
  return (PLAN_RANK[currentPlan.toLowerCase()] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0)
}

// GET /api/partner-portal/me
// Returns the full partner profile + tenant info + the resolved
// permissions (defaults merged + plan-gated). One round-trip per app
// boot lets the portal render every gated UI without further plan logic.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partnerId = await getPartnerByToken(token)
  if (!partnerId) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  let partner: any = null
  try {
    partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        phone: true,
        permissions: true,
        joined_at: true,
        tenant_id: true,
        shares: { where: { effective_to: null } },
      },
    })
  } catch (err: any) {
    console.warn('[partner-portal/me] partner lookup failed:', err.message)
    return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })
  }
  if (!partner) return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })

  let tenant: any = null
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: partner.tenant_id },
      select: { id: true, name: true, plan: true, feature_overrides: true },
    })
  } catch (err: any) {
    console.warn('[partner-portal/me] tenant lookup failed:', err.message)
  }
  const plan = (tenant?.plan ?? 'business').toLowerCase()
  const overrides = (tenant?.feature_overrides as string[] | null) ?? []

  // Merge defaults + saved permissions, then plan-gate every key.
  const saved = (partner.permissions ?? {}) as Record<string, boolean>
  const resolved: Record<string, boolean> = {}
  for (const [key, defVal] of Object.entries(DEFAULT_PERMISSIONS)) {
    const wanted = saved[key] ?? defVal
    const minPlan = PERMISSION_MIN_PLAN[key] ?? 'business'
    const planOk = planMeets(plan, minPlan) || overrides.includes(`partner_${key}`)
    resolved[key] = wanted && planOk
  }

  // Compute the partner's current balance for the header pill
  const [contribAgg, withdrawAgg] = await Promise.all([
    prisma.partnerContribution.aggregate({
      _sum: { amount: true },
      where: { partner_id: partnerId },
    }),
    prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { partner_id: partnerId },
    }),
  ])
  const balance = Number(contribAgg._sum.amount ?? 0) - Number(withdrawAgg._sum.amount ?? 0)

  // Average share % across all the partner's active shares
  const totalPct = partner.shares.reduce((s: number, sh: any) => s + Number(sh.percentage), 0)
  const avgPct = partner.shares.length > 0 ? totalPct / partner.shares.length : 0

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      joined_at: partner.joined_at,
      share_percent: avgPct,
      shares: partner.shares,
      balance,
    },
    tenant: tenant ? { id: tenant.id, name: tenant.name, plan } : null,
    permissions: resolved,
  })
}
