import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/partners/[id]/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns full statement of account: opening balance, all movements, closing balance.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { id } = await params

  const partner = await prisma.partner.findFirst({
    where: { id, tenant_id: tenantId },
    include: { shares: { where: { effective_to: null } } },
  })
  if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const fromParam = req.nextUrl.searchParams.get('from')
  const toParam = req.nextUrl.searchParams.get('to')
  const from = fromParam ? new Date(fromParam) : null
  const to = toParam ? new Date(toParam) : null

  // Opening balance: everything BEFORE `from`
  let opening = 0
  if (from) {
    const [contribOpen, withdrawOpen] = await Promise.all([
      prisma.partnerContribution.aggregate({
        _sum: { amount: true },
        where: { partner_id: id, occurred_at: { lt: from } },
      }),
      prisma.partnerWithdrawal.aggregate({
        _sum: { amount: true },
        where: { partner_id: id, occurred_at: { lt: from } },
      }),
    ])
    opening = Number(contribOpen._sum.amount ?? 0) - Number(withdrawOpen._sum.amount ?? 0)
  }

  // Movements within window
  const dateFilter: any = {}
  if (from) dateFilter.gte = from
  if (to) dateFilter.lte = to

  const [contributions, withdrawals] = await Promise.all([
    prisma.partnerContribution.findMany({
      where: {
        partner_id: id,
        ...(from || to ? { occurred_at: dateFilter } : {}),
      },
      orderBy: { occurred_at: 'asc' },
    }),
    prisma.partnerWithdrawal.findMany({
      where: {
        partner_id: id,
        ...(from || to ? { occurred_at: dateFilter } : {}),
      },
      include: { distribution: { select: { period_month: true, period_year: true } } },
      orderBy: { occurred_at: 'asc' },
    }),
  ])

  // Build movement list
  type Movement = {
    date: string
    type: 'contribution' | 'withdrawal'
    sub_type: string
    amount: number
    description: string | null
    period?: string | null
  }

  const movements: Movement[] = [
    ...contributions.map(c => ({
      date: c.occurred_at.toISOString(),
      type: 'contribution' as const,
      sub_type: c.type,
      amount: Number(c.amount),
      description: c.description,
    })),
    ...withdrawals.map(w => ({
      date: w.occurred_at.toISOString(),
      type: 'withdrawal' as const,
      sub_type: w.type,
      amount: Number(w.amount),
      description: w.description,
      period: w.distribution
        ? `${w.distribution.period_month}/${w.distribution.period_year}`
        : null,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  // Running balance
  let running = opening
  const movementsWithBalance = movements.map(m => {
    running += m.type === 'contribution' ? m.amount : -m.amount
    return { ...m, running_balance: running }
  })

  const totalContributions = contributions.reduce((s, c) => s + Number(c.amount), 0)
  const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0)
  const closing = opening + totalContributions - totalWithdrawals

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      shares: partner.shares,
    },
    period: { from: fromParam, to: toParam },
    opening_balance: opening,
    closing_balance: closing,
    total_contributions: totalContributions,
    total_withdrawals: totalWithdrawals,
    movements: movementsWithBalance,
  })
}
