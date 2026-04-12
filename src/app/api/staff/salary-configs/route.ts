import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/staff/salary-configs — batch fetch all salary configs for tenant
// Returns { [staff_id]: { monthly_amount, paid_this_month } }
// Replaces N individual /staff/[id]/salary-config calls
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const [configs, payments] = await Promise.all([
      prisma.staffSalaryConfig.findMany({
        where: { tenant_id: tenantId },
        select: { staff_id: true, monthly_amount: true, notes: true },
      }),
      prisma.salaryPayment.groupBy({
        by: ['staff_id'],
        where: { tenant_id: tenantId, month, year },
        _sum: { amount: true },
      }),
    ])

    const paidMap = new Map(payments.map(p => [p.staff_id, Number(p._sum.amount ?? 0)]))

    const result: Record<string, { monthly_amount: number; paid_this_month: number; notes: string }> = {}
    for (const c of configs) {
      result[c.staff_id] = {
        monthly_amount: Number(c.monthly_amount),
        paid_this_month: paidMap.get(c.staff_id) ?? 0,
        notes: c.notes ?? '',
      }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
