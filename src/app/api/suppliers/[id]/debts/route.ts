// GET /api/suppliers/[id]/debts
//
// Returns the supplier's profile + every credit-based expense
// (oldest first) + every payment ever made to them, plus a
// computed running balance. Used by the Flutter SupplierDetail
// screen.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const { id } = await params

  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (supplier.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // All expenses tied to this supplier (including fully paid ones).
  const expenses = await prisma.expense.findMany({
    where: { supplier_id: id },
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  // All payments to this supplier, newest first.
  const payments = await prisma.supplierPayment.findMany({
    where: { supplier_id: id },
    orderBy: { paid_at: 'desc' },
    take: 100,
  })

  const totalOwed = expenses.reduce((sum, e) => sum + Number(e.amount_owed ?? 0), 0)
  const orphanPayments = payments
    .filter((p) => !p.expense_id)
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const currentDebt = Math.max(0, totalOwed - orphanPayments)
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  return NextResponse.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      supplier_type: supplier.supplier_type,
      notes: supplier.notes,
      is_active: supplier.is_active,
      created_at: supplier.created_at.toISOString(),
    },
    summary: {
      current_debt: currentDebt,
      total_spent: totalSpent,
      total_paid: totalPaid,
      expense_count: expenses.length,
      payment_count: payments.length,
    },
    expenses: expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      amount_paid: Number(e.amount_paid),
      amount_owed: Number(e.amount_owed),
      payment_type: e.payment_type,
      related_to: e.related_to,
      created_at: e.created_at.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      payment_method: p.payment_method,
      notes: p.notes,
      expense_id: p.expense_id,
      paid_at: p.paid_at.toISOString(),
    })),
  })
}
