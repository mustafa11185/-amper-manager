import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Plan limits for partners
function maxPartnersForPlan(plan: string | null | undefined): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'starter': case 'trial': return 2
    case 'pro': case 'basic':     return 3
    case 'business': case 'gold': return 9999
    case 'corporate':             return 9999
    case 'fleet': case 'custom':  return 9999
    default:                      return 2
  }
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const partners = await prisma.partner.findMany({
    where: { tenant_id: tenantId },
    include: {
      shares: {
        where: { effective_to: null },
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: [{ is_active: 'desc' }, { joined_at: 'asc' }],
  })

  // Compute current balance for each partner: contributions - withdrawals
  const enriched = await Promise.all(partners.map(async (p) => {
    const [contribAgg, withdrawAgg] = await Promise.all([
      prisma.partnerContribution.aggregate({
        _sum: { amount: true },
        where: { partner_id: p.id },
      }),
      prisma.partnerWithdrawal.aggregate({
        _sum: { amount: true },
        where: { partner_id: p.id },
      }),
    ])
    const contributions = Number(contribAgg._sum.amount ?? 0)
    const withdrawals = Number(withdrawAgg._sum.amount ?? 0)
    return {
      ...p,
      total_contributions: contributions,
      total_withdrawals: withdrawals,
      current_balance: contributions - withdrawals,
    }
  }))

  return NextResponse.json({
    partners: enriched,
    max_allowed: maxPartnersForPlan(user.plan),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه إضافة شركاء' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const { name, phone, national_id, notes, shares } = await req.json()

    if (!name) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })

    // Plan limit check
    const max = maxPartnersForPlan(user.plan)
    const current = await prisma.partner.count({ where: { tenant_id: tenantId } })
    if (current >= max) {
      return NextResponse.json(
        { error: `وصلت للحد الأقصى من الشركاء في باقتك (${max}) — قم بالترقية للمزيد` },
        { status: 403 }
      )
    }

    const partner = await prisma.partner.create({
      data: {
        tenant_id: tenantId,
        name,
        phone: phone || null,
        national_id: national_id || null,
        notes: notes || null,
        is_active: true,
      },
    })

    // Optional: create initial shares
    if (Array.isArray(shares) && shares.length > 0) {
      await prisma.partnerShare.createMany({
        data: shares.map((s: any) => ({
          tenant_id: tenantId,
          partner_id: partner.id,
          scope_type: s.scope_type ?? 'tenant',
          scope_id: s.scope_id ?? null,
          percentage: Number(s.percentage),
        })),
      })
    }

    return NextResponse.json({ partner }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
