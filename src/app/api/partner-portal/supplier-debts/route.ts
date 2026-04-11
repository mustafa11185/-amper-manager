// GET /api/partner-portal/supplier-debts
//
// Read-only supplier debt summary for the partner portal. Lets the
// partner see the operational debts before computing their share of
// the project's profit. Permission-gated by `view_expenses` so the
// owner can opt the partner in/out from the partner detail screen.

export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerByToken } from '../login/route'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partnerId = await getPartnerByToken(token)
  if (!partnerId) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  // Look up the partner's tenant + permissions.
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { tenant_id: true, permissions: true },
  })
  if (!partner) return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })

  // Permission gate. Default to false — the owner must explicitly
  // grant view_expenses for the partner to see this data.
  const perms = (partner.permissions ?? {}) as Record<string, boolean>
  if (perms.view_expenses !== true) {
    return NextResponse.json({ error: 'permission_denied' }, { status: 403 })
  }

  // Aggregate suppliers + current debts (same shape as the manager
  // report so the Flutter side can reuse rendering logic).
  const suppliers = await prisma.supplier.findMany({
    where: { tenant_id: partner.tenant_id, is_active: true },
    include: {
      expenses: { select: { amount_owed: true, amount: true, created_at: true } },
      payments: { where: { expense_id: null }, select: { amount: true } },
    },
  })

  const perSupplier = suppliers.map((s) => {
    const totalOwed = s.expenses.reduce((sum, e) => sum + Number(e.amount_owed ?? 0), 0)
    const orphanPaid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const currentDebt = Math.max(0, totalOwed - orphanPaid)
    return {
      id: s.id,
      name: s.name,
      supplier_type: s.supplier_type,
      current_debt: currentDebt,
      total_spent: s.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
      expense_count: s.expenses.length,
    }
  }).filter((s) => s.current_debt > 0).sort((a, b) => b.current_debt - a.current_debt)

  const totalOwed = perSupplier.reduce((sum, s) => sum + s.current_debt, 0)

  return NextResponse.json({
    total_owed: totalOwed,
    supplier_count: perSupplier.length,
    suppliers: perSupplier,
  })
}
