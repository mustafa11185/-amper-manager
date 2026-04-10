import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const tenantId = user.tenantId as string
  const { id } = await params

  try {
    const { amount, type, description, occurred_at } = await req.json()

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 })
    }

    const partner = await prisma.partner.findFirst({ where: { id, tenant_id: tenantId } })
    if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    const withdrawal = await prisma.partnerWithdrawal.create({
      data: {
        tenant_id: tenantId,
        partner_id: id,
        amount: Number(amount),
        type: type || 'personal_withdrawal',
        description: description || null,
        occurred_at: occurred_at ? new Date(occurred_at) : new Date(),
      },
    })

    return NextResponse.json({ withdrawal }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
