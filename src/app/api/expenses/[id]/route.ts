import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/expenses/[id] — update an expense
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { id } = await params

  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { branch: { select: { tenant_id: true } } },
    })
    if (!expense || expense.branch.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    }

    const body = await req.json()
    const { category, amount, description, payment_type, amount_paid, supplier_id } = body

    const updateData: any = {}
    if (category !== undefined) updateData.category = category
    if (description !== undefined) updateData.description = description || null
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null

    if (amount !== undefined && Number(amount) > 0) {
      const numAmt = Number(amount)
      updateData.amount = numAmt

      const pType = payment_type ?? expense.payment_type ?? 'cash'
      updateData.payment_type = pType
      if (pType === 'cash') {
        updateData.amount_paid = numAmt
        updateData.amount_owed = 0
      } else if (pType === 'credit') {
        updateData.amount_paid = 0
        updateData.amount_owed = numAmt
      } else if (pType === 'partial') {
        const paid = Math.max(0, Math.min(numAmt, Number(amount_paid ?? 0)))
        updateData.amount_paid = paid
        updateData.amount_owed = numAmt - paid
      }
    } else if (payment_type !== undefined) {
      // Change payment type without changing amount
      const numAmt = Number(expense.amount)
      updateData.payment_type = payment_type
      if (payment_type === 'cash') {
        updateData.amount_paid = numAmt
        updateData.amount_owed = 0
        updateData.supplier_id = null
      } else if (payment_type === 'credit') {
        updateData.amount_paid = 0
        updateData.amount_owed = numAmt
      }
    }

    const updated = await prisma.expense.update({ where: { id }, data: updateData })
    return NextResponse.json({ ok: true, expense: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}

// DELETE /api/expenses/[id] — soft-delete if >24h old, hard-delete if recent
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'فقط المالك أو المدير يمكنه الحذف' }, { status: 403 })
  }

  const { id } = await params

  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { branch: { select: { tenant_id: true } } },
    })
    if (!expense || expense.branch.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    }

    // If has supplier payments linked, prevent deletion
    const linkedPayments = await prisma.supplierPayment.count({ where: { expense_id: id } })
    if (linkedPayments > 0) {
      return NextResponse.json({
        error: 'لا يمكن حذف مصروف مرتبط بدفعات مورّد — احذف الدفعات أولاً',
      }, { status: 400 })
    }

    await prisma.expense.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'تم حذف المصروف' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
