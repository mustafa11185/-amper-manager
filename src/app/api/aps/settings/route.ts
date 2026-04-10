import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      aps_enabled: true,
      aps_biller_code: true,
      aps_service_type: true,
      aps_billing_prefix: true,
      aps_settlement_iban: true,
    },
  })

  // How many subscribers already have a biller_account_no
  const [totalSubs, assignedSubs] = await Promise.all([
    prisma.subscriber.count({ where: { tenant_id: user.tenantId, is_active: true } }),
    prisma.subscriber.count({
      where: { tenant_id: user.tenantId, is_active: true, biller_account_no: { not: null } },
    }),
  ])

  return NextResponse.json({
    enabled: tenant?.aps_enabled ?? false,
    biller_code: tenant?.aps_biller_code ?? null,
    service_type: tenant?.aps_service_type ?? null,
    billing_prefix: tenant?.aps_billing_prefix ?? null,
    settlement_iban: tenant?.aps_settlement_iban ?? null,
    total_subscribers: totalSubs,
    assigned_subscribers: assignedSubs,
    unassigned_subscribers: totalSubs - assignedSubs,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const { enabled, biller_code, service_type, billing_prefix, settlement_iban } = await req.json()

    // Validate billing prefix is unique across tenants if changed
    if (billing_prefix) {
      const conflict = await prisma.tenant.findFirst({
        where: {
          aps_billing_prefix: billing_prefix,
          NOT: { id: user.tenantId },
        },
      })
      if (conflict) {
        return NextResponse.json(
          { error: 'هذا البادئة مستخدمة من قبل عميل آخر — اختر بادئة مختلفة' },
          { status: 409 }
        )
      }
    }

    const data: any = {}
    if (enabled !== undefined) data.aps_enabled = enabled
    if (biller_code !== undefined) data.aps_biller_code = biller_code || null
    if (service_type !== undefined) data.aps_service_type = service_type || null
    if (billing_prefix !== undefined) data.aps_billing_prefix = billing_prefix || null
    if (settlement_iban !== undefined) data.aps_settlement_iban = settlement_iban || null

    await prisma.tenant.update({
      where: { id: user.tenantId },
      data,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
