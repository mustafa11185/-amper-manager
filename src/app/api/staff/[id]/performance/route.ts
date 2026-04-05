import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = (session.user as any).tenantId as string
  const { id: staffId } = await params
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  try {
    const [collections, salary, wallet] = await Promise.all([
      // Collections this month (payments recorded by this staff)
      prisma.$queryRaw<Array<{ payments_count: bigint; total_collected: any }>>`
        SELECT
          COUNT(*)::bigint as payments_count,
          COALESCE(SUM(amount), 0)::numeric as total_collected
        FROM payments
        WHERE recorded_by = ${staffId}
          AND tenant_id = ${tenantId}
          AND created_at >= ${start}
          AND created_at < ${end}
      `,

      // Salary config + amount paid this month
      prisma.$queryRaw<Array<{ monthly_amount: any; paid: any }>>`
        SELECT
          COALESCE(sc.monthly_amount, 0)::numeric as monthly_amount,
          COALESCE((
            SELECT SUM(sp.amount) FROM salary_payments sp
            WHERE sp.staff_id = ${staffId}
              AND sp.month = ${month}
              AND sp.year = ${year}
          ), 0)::numeric as paid
        FROM staff_salary_configs sc
        WHERE sc.staff_id = ${staffId}
        LIMIT 1
      `,

      // Collector wallet balance
      prisma.$queryRaw<Array<{ balance: any }>>`
        SELECT COALESCE(balance, 0)::numeric as balance
        FROM collector_wallets
        WHERE staff_id = ${staffId}
        LIMIT 1
      `,
    ])

    const pay = collections[0] ?? { payments_count: BigInt(0), total_collected: 0 }
    const sal = salary[0] ?? { monthly_amount: 0, paid: 0 }
    const wal = wallet[0] ?? { balance: 0 }

    const monthlyAmount = Number(sal.monthly_amount ?? 0)
    const paid = Number(sal.paid ?? 0)

    return NextResponse.json({
      month, year,
      payments_count: Number(pay.payments_count ?? 0),
      total_collected: Number(pay.total_collected ?? 0),
      monthly_amount: monthlyAmount,
      paid,
      pending: Math.max(0, monthlyAmount - paid),
      wallet_balance: Number(wal.balance ?? 0),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
