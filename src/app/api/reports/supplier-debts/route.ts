// GET /api/reports/supplier-debts
//
// Owner / accountant report. Returns:
//   • total_owed     — sum of every supplier's current debt
//   • per_supplier   — every supplier with their debt + last expense
//   • recent_payments — last 20 supplier payments
//   • by_type        — breakdown by supplier_type (fuel/oil/...)

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const tenantId = user.tenantId as string

  const suppliers = await prisma.supplier.findMany({
    where: { tenant_id: tenantId, is_active: true },
    include: {
      expenses: {
        select: { amount: true, amount_paid: true, amount_owed: true, created_at: true },
        orderBy: { created_at: 'desc' },
      },
      payments: {
        where: { expense_id: null },
        select: { amount: true },
      },
    },
  })

  const perSupplier = suppliers.map((s) => {
    const totalOwed = s.expenses.reduce((sum, e) => sum + Number(e.amount_owed ?? 0), 0)
    const orphanPaid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const currentDebt = Math.max(0, totalOwed - orphanPaid)
    const totalSpent = s.expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    const lastExpense = s.expenses[0]
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      supplier_type: s.supplier_type,
      current_debt: currentDebt,
      total_spent: totalSpent,
      expense_count: s.expenses.length,
      last_expense_at: lastExpense?.created_at?.toISOString() ?? null,
    }
  }).sort((a, b) => b.current_debt - a.current_debt)

  const totalOwed = perSupplier.reduce((sum, s) => sum + s.current_debt, 0)

  // Recent payments across all suppliers
  const recentPayments = await prisma.supplierPayment.findMany({
    where: { tenant_id: tenantId },
    orderBy: { paid_at: 'desc' },
    take: 20,
    include: { supplier: { select: { name: true } } },
  })

  // Breakdown by supplier type
  const byType: Record<string, { count: number; debt: number }> = {}
  for (const s of perSupplier) {
    const t = s.supplier_type
    if (!byType[t]) byType[t] = { count: 0, debt: 0 }
    byType[t].count += 1
    byType[t].debt += s.current_debt
  }

  return NextResponse.json({
    total_owed: totalOwed,
    supplier_count: perSupplier.length,
    per_supplier: perSupplier,
    by_type: byType,
    recent_payments: recentPayments.map((p) => ({
      id: p.id,
      supplier_id: p.supplier_id,
      supplier_name: p.supplier?.name ?? '—',
      amount: Number(p.amount),
      payment_method: p.payment_method,
      notes: p.notes,
      paid_at: p.paid_at.toISOString(),
    })),
  })
}
