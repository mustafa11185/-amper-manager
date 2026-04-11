// POST /api/suppliers/[id]/pay
//
// Records a payment to a supplier. Two modes:
//   • { amount, expense_id }       — pays against a specific expense.
//                                     Reduces that expense.amount_owed
//                                     and increases its amount_paid.
//                                     If amount_owed reaches 0 the
//                                     expense's payment_type flips to
//                                     'cash' (fully settled).
//   • { amount }                   — generic payment against the
//                                     supplier's running balance.
//                                     Stored as a SupplierPayment
//                                     with expense_id=null. Can be
//                                     reconciled later if needed.
//
// Body: { amount, expense_id?, payment_method?, notes? }
// Owner / accountant only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  try {
    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (supplier.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const amount = Number(body.amount)
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
    }
    const method = body.payment_method ? String(body.payment_method) : 'cash'
    const notes = body.notes ? String(body.notes).trim() : null
    const expenseId = body.expense_id ? String(body.expense_id) : null

    const result = await prisma.$transaction(async (tx) => {
      // Create the payment row first.
      const payment = await tx.supplierPayment.create({
        data: {
          tenant_id: user.tenantId,
          supplier_id: id,
          expense_id: expenseId,
          amount,
          payment_method: method,
          notes,
          recorded_by: user.name || user.id,
        },
      })

      // If targeted at a specific expense, update its amounts.
      if (expenseId) {
        const expense = await tx.expense.findUnique({ where: { id: expenseId } })
        if (!expense) throw new Error('expense_not_found')
        if (expense.supplier_id !== id) {
          throw new Error('expense_not_linked_to_supplier')
        }
        const newOwed = Math.max(0, Number(expense.amount_owed) - amount)
        const newPaid = Number(expense.amount_paid) + amount
        const newPaymentType = newOwed <= 0 ? 'cash' : 'partial'
        await tx.expense.update({
          where: { id: expenseId },
          data: {
            amount_owed: newOwed,
            amount_paid: newPaid,
            payment_type: newPaymentType,
          },
        })
      }

      return payment
    })

    return NextResponse.json({ ok: true, payment: result })
  } catch (err: any) {
    console.error('[suppliers/pay]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
