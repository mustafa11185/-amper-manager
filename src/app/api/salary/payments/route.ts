import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams
  const staffId = url.get('staff_id')
  const month = parseInt(url.get('month') || `${new Date().getMonth() + 1}`)
  const year = parseInt(url.get('year') || `${new Date().getFullYear()}`)

  if (!staffId) return NextResponse.json({ error: 'staff_id مطلوب' }, { status: 400 })

  try {
    const payments = await prisma.salaryPayment.findMany({
      where: { staff_id: staffId, month, year },
      orderBy: { paid_at: 'desc' },
    })

    return NextResponse.json({
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        payment_type: p.payment_type || 'salary',
        notes: p.notes,
        tip_notes: p.tip_notes,
        paid_at: p.paid_at.toISOString(),
        paid_from_delivery: p.paid_from_delivery,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
