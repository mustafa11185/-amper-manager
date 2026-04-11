// GET /api/suppliers
//   Returns the tenant's suppliers + each supplier's current
//   running debt (sum of expense.amount_owed minus orphan
//   payments not tied to a specific expense).
//
// POST /api/suppliers
//   Body: { name, phone?, supplier_type?, notes? }
//   Owner / accountant only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const tenantId = user.tenantId as string

  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('include_inactive') === '1'

  const suppliers = await prisma.supplier.findMany({
    where: {
      tenant_id: tenantId,
      ...(includeInactive ? {} : { is_active: true }),
    },
    orderBy: { name: 'asc' },
    include: {
      expenses: { select: { amount_owed: true } },
      payments: {
        where: { expense_id: null },
        select: { amount: true },
      },
    },
  })

  const result = suppliers.map((s: any) => {
    const totalOwedFromExpenses = s.expenses.reduce(
      (sum: number, e: any) => sum + Number(e.amount_owed ?? 0), 0,
    )
    const orphanPayments = s.payments.reduce(
      (sum: number, p: any) => sum + Number(p.amount ?? 0), 0,
    )
    const currentDebt = Math.max(0, totalOwedFromExpenses - orphanPayments)
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      supplier_type: s.supplier_type,
      notes: s.notes,
      is_active: s.is_active,
      current_debt: currentDebt,
      expense_count: s.expenses.length,
    }
  })

  const totalDebt = result.reduce((sum, s) => sum + s.current_debt, 0)

  return NextResponse.json({
    suppliers: result,
    total_debt: totalDebt,
    count: result.length,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })

    const supplier = await prisma.supplier.create({
      data: {
        tenant_id: user.tenantId,
        name,
        phone: body.phone ? String(body.phone).trim() : null,
        supplier_type: ['fuel', 'oil', 'spare_parts', 'service', 'other']
          .includes(body.supplier_type) ? body.supplier_type : 'other',
        notes: body.notes ? String(body.notes).trim() : null,
      },
    })

    return NextResponse.json({ ok: true, supplier })
  } catch (err: any) {
    console.error('[suppliers POST]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
