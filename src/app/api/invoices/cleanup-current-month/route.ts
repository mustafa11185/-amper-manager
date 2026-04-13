// POST /api/invoices/cleanup-current-month
//
// Escape hatch for a specific broken state: current-month invoices
// left marked is_fully_paid=true with payment_method='rolled_to_debt'
// by a botched generation + incomplete reverse. The normal reverse
// endpoint only touches invoices that were UPDATED in the last
// generation, so if the bad state is older it slips through.
//
// This endpoint finds every current-month invoice for the branch
// that has payment_method='rolled_to_debt' and resets it to clean
// unpaid state (is_fully_paid=false, amount_paid=0, payment_method=null)
// so the next generate can update them properly. It does NOT touch
// subscriber.total_debt — for that use reverse-last-generation.
//
// Owner/manager only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string; tenantId?: string }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { branch_id } = await req.json()
    const tenantId = user.tenantId as string
    if (!branch_id) {
      return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: tenantId },
    })
    if (!branch) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

    const now = new Date()
    const billingMonth = now.getMonth() + 1
    const billingYear = now.getFullYear()

    const result = await prisma.invoice.updateMany({
      where: {
        branch_id,
        billing_month: billingMonth,
        billing_year: billingYear,
        payment_method: 'rolled_to_debt',
      },
      data: {
        is_fully_paid: false,
        amount_paid: 0,
        payment_method: null,
      },
    })

    return NextResponse.json({
      ok: true,
      cleaned: result.count,
      billing_month: billingMonth,
      billing_year: billingYear,
    })
  } catch (err) {
    console.error('Cleanup current month error:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'خطأ' },
      { status: 500 },
    )
  }
}
