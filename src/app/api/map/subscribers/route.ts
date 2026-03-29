import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId

  try {
    const branchFilter = user.role === 'owner'
      ? { tenant_id: tenantId }
      : { id: user.branchId }
    const branches = await prisma.branch.findMany({ where: branchFilter, select: { id: true } })
    const branchIds = branches.map(b => b.id)

    // Get active billing month
    let billingMonth = new Date().getMonth() + 1
    let billingYear = new Date().getFullYear()
    try {
      const pricing = await prisma.monthlyPricing.findFirst({
        where: { branch_id: { in: branchIds } },
        orderBy: { effective_from: 'desc' },
      })
      if (pricing?.effective_from) {
        const eff = new Date(pricing.effective_from)
        billingMonth = eff.getMonth() + 1
        billingYear = eff.getFullYear()
      }
    } catch { /* use defaults */ }

    // Get subscribers with GPS coordinates
    const subscribers = await prisma.subscriber.findMany({
      where: {
        branch_id: { in: branchIds },
        is_active: true,
        gps_lat: { not: null },
        gps_lng: { not: null },
      },
      select: {
        id: true,
        name: true,
        gps_lat: true,
        gps_lng: true,
        total_debt: true,
        serial_number: true,
      },
    })

    // Get paid subscriber IDs for current month
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        branch_id: { in: branchIds },
        billing_month: billingMonth,
        billing_year: billingYear,
        is_fully_paid: true,
      },
      select: { subscriber_id: true },
      distinct: ['subscriber_id'],
    })
    const paidIds = new Set(paidInvoices.map(i => i.subscriber_id))

    return NextResponse.json({
      subscribers: subscribers.map(s => ({
        id: s.id,
        name: s.name,
        serial_number: s.serial_number,
        lat: Number(s.gps_lat),
        lng: Number(s.gps_lng),
        is_paid: paidIds.has(s.id),
        total_debt: Number(s.total_debt),
      })),
    })
  } catch (e) {
    console.error('[map/subscribers]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
