import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'
import { getCurrentCycleWindow } from '@/lib/billing-cycle'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) {
      return NextResponse.json({ total_discounts: 0, discount_count: 0, total_tips: 0, tip_count: 0, by_staff: [] })
    }

    // Cycle-scoped: discounts on this cycle's invoices + tips paid
    // since the cycle started.
    const cycle = await getCurrentCycleWindow(branchIds[0])
    const month = cycle.month
    const year = cycle.year
    const monthStart = cycle.start

    const [discountInvoices, tipPayments] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          branch_id: { in: branchIds },
          billing_month: month,
          billing_year: year,
          discount_amount: { gt: 0 },
        },
        select: { discount_amount: true, collector_id: true },
      }),
      prisma.salaryPayment.findMany({
        where: {
          tenant_id: tenantId,
          branch_id: { in: branchIds },
          payment_type: 'tip',
          paid_at: { gte: monthStart },
        },
        select: { amount: true, staff_id: true },
      }),
    ])

    const totalDiscounts = discountInvoices.reduce((s, i) => s + Number(i.discount_amount), 0)
    const totalTips = tipPayments.reduce((s, p) => s + Number(p.amount), 0)

    // By staff breakdown
    const byStaffMap = new Map<string, { discounts: number; discount_count: number; tips: number; tip_count: number }>()
    for (const inv of discountInvoices) {
      if (!inv.collector_id) continue
      const entry = byStaffMap.get(inv.collector_id) ?? { discounts: 0, discount_count: 0, tips: 0, tip_count: 0 }
      entry.discounts += Number(inv.discount_amount)
      entry.discount_count += 1
      byStaffMap.set(inv.collector_id, entry)
    }
    for (const tip of tipPayments) {
      const entry = byStaffMap.get(tip.staff_id) ?? { discounts: 0, discount_count: 0, tips: 0, tip_count: 0 }
      entry.tips += Number(tip.amount)
      entry.tip_count += 1
      byStaffMap.set(tip.staff_id, entry)
    }

    const staffIds = [...byStaffMap.keys()]
    const staffList = staffIds.length > 0
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true, role: true },
        })
      : []
    const nameMap = new Map(staffList.map(s => [s.id, { name: s.name, role: s.role }]))

    const byStaff = [...byStaffMap.entries()].map(([id, v]) => ({
      id,
      name: nameMap.get(id)?.name ?? '—',
      role: nameMap.get(id)?.role ?? '—',
      ...v,
    })).sort((a, b) => (b.discounts + b.tips) - (a.discounts + a.tips))

    return NextResponse.json({
      total_discounts: totalDiscounts,
      discount_count: discountInvoices.length,
      total_tips: totalTips,
      tip_count: tipPayments.length,
      by_staff: byStaff,
    })
  } catch (err: any) {
    console.error('[reports/discounts]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
