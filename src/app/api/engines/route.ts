import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Plan-driven engine quota — mirrors plan_limits.dart
function maxEnginesForPlan(plan: string | null | undefined): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'starter': case 'trial': case 'basic': return 1
    case 'pro': return 3
    case 'business': case 'gold': return 8
    case 'corporate': return 20
    case 'fleet': case 'custom': return 9999
    default: return 1
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const branchFilter = user.role === 'owner'
    ? { tenant_id: tenantId }
    : { id: branchId }

  const branches = await prisma.branch.findMany({
    where: branchFilter,
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const generators = await prisma.generator.findMany({
    where: { branch_id: { in: branchIds } },
    include: {
      engines: {
        include: {
          temperature_logs: {
            orderBy: { logged_at: 'desc' },
            take: 1,
          },
          fuel_logs: {
            orderBy: { logged_at: 'desc' },
            take: 1,
          },
        },
      },
      manual_overrides: {
        where: { deactivated_at: null },
        orderBy: { activated_at: 'desc' },
        take: 1,
      },
    },
  })

  return NextResponse.json({ generators })
}

// POST /api/engines  Body: { generator_id, name, model?, oil_change_hours?, ... }
// Adds a new engine to a generator. Validates the tenant's plan quota.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه إضافة محرك' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { generator_id, name, model, oil_change_hours, air_filter_hours, full_service_hours } = body
    if (!generator_id || !name?.trim()) {
      return NextResponse.json({ error: 'الاسم والمولد مطلوبان' }, { status: 400 })
    }

    // Verify the generator belongs to this tenant
    const gen = await prisma.generator.findUnique({
      where: { id: generator_id },
      include: { branch: { select: { tenant_id: true } } },
    })
    if (!gen || gen.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'مولد غير موجود' }, { status: 404 })
    }

    // Plan quota check — count engines across the tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { plan: true },
    })
    const max = maxEnginesForPlan(tenant?.plan)
    const currentCount = await prisma.engine.count({
      where: { generator: { branch: { tenant_id: user.tenantId } } },
    })
    if (currentCount >= max) {
      return NextResponse.json(
        { error: `وصلت الحد الأقصى (${max} محرك) في باقتك. رقّي لإضافة المزيد.`, code: 'plan_limit' },
        { status: 403 },
      )
    }

    const engine = await prisma.engine.create({
      data: {
        generator_id,
        name: name.trim(),
        model: model?.trim() || null,
        oil_change_hours: Number(oil_change_hours) || 250,
        air_filter_hours: Number(air_filter_hours) || 500,
        full_service_hours: Number(full_service_hours) || 1000,
      },
    })
    return NextResponse.json({ engine }, { status: 201 })
  } catch (err: any) {
    console.error('[engines POST]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
