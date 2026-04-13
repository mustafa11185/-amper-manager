import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const branchIds = await resolveBranchIds(req, user)
    if (branchIds.length === 0) return NextResponse.json({ aging: [] })

    const now = new Date()
    const day = 24 * 60 * 60 * 1000

    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        branch_id: { in: branchIds },
        is_fully_paid: false,
        is_reversed: false,
      },
      select: { total_amount_due: true, amount_paid: true, created_at: true },
    })

    const buckets = {
      '0-30': { count: 0, total: 0 },
      '31-60': { count: 0, total: 0 },
      '61-90': { count: 0, total: 0 },
      '90+': { count: 0, total: 0 },
    }

    for (const inv of unpaidInvoices) {
      const ageDays = Math.floor((now.getTime() - inv.created_at.getTime()) / day)
      const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
      if (remaining <= 0) continue
      let key: keyof typeof buckets = '0-30'
      if (ageDays > 90) key = '90+'
      else if (ageDays > 60) key = '61-90'
      else if (ageDays > 30) key = '31-60'
      buckets[key].count += 1
      buckets[key].total += remaining
    }

    const grandTotal = Object.values(buckets).reduce((s, b) => s + b.total, 0)
    const aging = Object.entries(buckets).map(([range, v]) => ({
      range,
      count: v.count,
      total: v.total,
      percentage: grandTotal > 0 ? Math.round((v.total / grandTotal) * 100) : 0,
    }))

    return NextResponse.json({ aging, grand_total: grandTotal })
  } catch (err: any) {
    console.error('[reports/debt-aging]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
