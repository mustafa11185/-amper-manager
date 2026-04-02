import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ARABIC_MONTHS: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل',
  5: 'مايو', 6: 'يونيو', 7: 'تموز', 8: 'آب',
  9: 'أيلول', 10: 'تشرين الأول', 11: 'تشرين الثاني', 12: 'كانون الأول',
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const branchId = req.nextUrl.searchParams.get('branch_id') || user.branchId

  try {
    const log = await prisma.invoiceGenerationLog.findFirst({
      where: { branch_id: branchId, is_reversed: false },
      orderBy: { generated_at: 'desc' },
    })

    if (!log) return NextResponse.json({ last_generation: null })

    const genDate = new Date(log.generated_at)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const isToday = genDate >= todayStart

    return NextResponse.json({
      last_generation: {
        id: log.id,
        generated_at: log.generated_at,
        invoice_count: log.invoice_count,
        debt_count: log.debt_count,
        billing_month: log.billing_month,
        billing_year: log.billing_year,
        billing_month_name: ARABIC_MONTHS[log.billing_month] ?? '',
        is_today: isToday,
        can_reverse: isToday,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ last_generation: null })
  }
}
