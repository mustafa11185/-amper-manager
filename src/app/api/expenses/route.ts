import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchFilter = user.role === 'owner' ? { branch: { tenant_id: tenantId } } : { branch_id: user.branchId }
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
  const expenses = await prisma.expense.findMany({
    where: { ...branchFilter, created_at: { gte: monthStart } },
    orderBy: { created_at: 'desc' },
    take: 100,
    include: { supplier: { select: { id: true, name: true, supplier_type: true } } },
  })
  const total = expenses.reduce((a: number, e: any) => a + Number(e.amount), 0)
  // Total still owed across all loaded expenses — useful for the
  // expenses screen header so the user sees both spent + owed at
  // a glance.
  const totalOwed = expenses.reduce((a: number, e: any) => a + Number(e.amount_owed ?? 0), 0)
  return NextResponse.json({
    expenses: expenses.map((e: any) => ({
      id: e.id,
      category: e.category,
      amount: Number(e.amount),
      amount_paid: Number(e.amount_paid ?? 0),
      amount_owed: Number(e.amount_owed ?? 0),
      payment_type: e.payment_type ?? 'cash',
      supplier_id: e.supplier_id,
      supplier_name: e.supplier?.name ?? null,
      supplier_type: e.supplier?.supplier_type ?? null,
      description: e.description,
      related_to: e.related_to,
      created_at: e.created_at.toISOString(),
    })),
    monthly_total: total,
    monthly_owed: totalOwed,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const body = await req.json()
  const { category, amount, description, supplier_id } = body
  if (!category || !amount) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const numericAmount = Number(amount)
  if (numericAmount <= 0) {
    return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
  }

  // Payment type: 'cash' (default), 'credit', or 'partial'.
  const allowedTypes = ['cash', 'credit', 'partial']
  const paymentType = allowedTypes.includes(body.payment_type) ? body.payment_type : 'cash'

  // amount_paid: how much the user actually paid right now
  //   cash    → entire amount
  //   credit  → 0
  //   partial → caller-provided value (clamped 0..amount)
  let amountPaid = 0
  if (paymentType === 'cash') {
    amountPaid = numericAmount
  } else if (paymentType === 'partial') {
    amountPaid = Math.max(0, Math.min(numericAmount, Number(body.amount_paid ?? 0)))
  } // credit → stays 0

  const amountOwed = numericAmount - amountPaid

  // Credit/partial expenses MUST link to a supplier — otherwise we
  // can't compute who is owed what.
  if ((paymentType === 'credit' || paymentType === 'partial') && !supplier_id) {
    return NextResponse.json({
      error: 'يجب اختيار المورّد عند الشراء بالدين أو الدفع الجزئي',
    }, { status: 400 })
  }

  // If a supplier is specified, verify it belongs to this tenant.
  let resolvedSupplierId: string | null = null
  if (supplier_id) {
    const sup = await prisma.supplier.findUnique({ where: { id: supplier_id } })
    if (!sup || sup.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'المورّد غير صالح' }, { status: 400 })
    }
    resolvedSupplierId = sup.id
  }

  const branches = await prisma.branch.findMany({ where: { tenant_id: user.tenantId }, select: { id: true }, take: 1 })
  const branchId = user.branchId || branches[0]?.id
  if (!branchId) return NextResponse.json({ error: 'No branch' }, { status: 400 })

  const expense = await prisma.expense.create({
    data: {
      branch_id: branchId,
      staff_id: user.id,
      category,
      amount: numericAmount,
      amount_paid: amountPaid,
      amount_owed: amountOwed,
      payment_type: paymentType,
      supplier_id: resolvedSupplierId,
      description: description || null,
      related_to: body.related_to ?? null,
    },
  })
  return NextResponse.json({ ok: true, expense })
}
