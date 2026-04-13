// GET /api/wallets/transactions
//
// Read-only feed of every DeliveryRecord between the team and the
// owner/manager. Powers the staff_flutter "سجل تسليمات الفريق"
// report. Tenant-scoped and supports the standard date / staff /
// branch / role / payment-type / status filters.
//
// Returns:
//   - transactions: list with from_staff + to_staff name & role
//     resolved
//   - summary: today / week / month totals + counts (always for the
//     full tenant range, ignoring active filters, so the header
//     numbers don't jump around as the user tweaks chips)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { id?: string; role?: string; tenantId?: string; branchId?: string }
  const tenantId = user.tenantId
  if (!tenantId) return NextResponse.json({ error: 'no tenant' }, { status: 400 })

  // Owner / manager / accountant see the whole tenant. Other roles
  // are restricted to their own deliveries.
  const isPrivileged = user.role === 'owner' || user.role === 'manager' || user.role === 'accountant'

  const sp = req.nextUrl.searchParams
  const fromStr = sp.get('from')
  const toStr = sp.get('to')
  const staffId = sp.get('staff_id')
  const branchIdParam = sp.get('branch_id') || user.branchId
  const role = sp.get('role') // 'collector' | 'kiosk' | 'accountant' | 'cashier' | 'operator' | null
  const paymentType = sp.get('payment_type') // 'cash' | 'transfer' | 'zaincash' | null
  const status = sp.get('status') // 'pending' | 'confirmed' | null
  const limit = Math.min(parseInt(sp.get('limit') ?? '500', 10), 1000)

  // Resolve branch scope.
  const branches = await prisma.branch.findMany({
    where: branchIdParam ? { id: branchIdParam, tenant_id: tenantId } : { tenant_id: tenantId },
    select: { id: true, name: true },
  })
  const branchIds = branches.map((b) => b.id)
  if (branchIds.length === 0) {
    return NextResponse.json({ transactions: [], summary: emptySummary() })
  }

  // Resolve role filter to a set of staff ids if needed.
  let staffIdsForRole: string[] | null = null
  if (role) {
    const list = await prisma.staff.findMany({
      where: { tenant_id: tenantId, role: role as never },
      select: { id: true },
    })
    staffIdsForRole = list.map((s) => s.id)
    if (staffIdsForRole.length === 0) {
      return NextResponse.json({ transactions: [], summary: await computeSummary(branchIds) })
    }
  }

  const where: Record<string, unknown> = {
    branch_id: { in: branchIds },
  }
  if (!isPrivileged && user.id) {
    where.from_staff_id = user.id
  }
  if (staffId) {
    where.from_staff_id = staffId
  } else if (staffIdsForRole) {
    where.from_staff_id = { in: staffIdsForRole }
  }
  if (paymentType) where.payment_type = paymentType
  if (status === 'confirmed') where.is_confirmed = true
  if (status === 'pending') where.is_confirmed = false

  if (fromStr || toStr) {
    const range: Record<string, Date> = {}
    if (fromStr) {
      const d = new Date(fromStr)
      if (!isNaN(d.getTime())) range.gte = d
    }
    if (toStr) {
      const d = new Date(toStr)
      if (!isNaN(d.getTime())) {
        // Make `to` inclusive of the whole day.
        d.setHours(23, 59, 59, 999)
        range.lte = d
      }
    }
    if (Object.keys(range).length > 0) where.delivered_at = range
  }

  const records = await prisma.deliveryRecord.findMany({
    where,
    orderBy: { delivered_at: 'desc' },
    take: limit,
  })

  // Resolve all participants in one batch (avoid N+1).
  const ids = new Set<string>()
  for (const r of records) {
    ids.add(r.from_staff_id)
    if (r.to_staff_id) ids.add(r.to_staff_id)
    if (r.confirmed_by) ids.add(r.confirmed_by)
  }
  const staffMap = new Map<string, { id: string; name: string; role: string }>()
  if (ids.size > 0) {
    const staffList = await prisma.staff.findMany({
      where: { id: { in: Array.from(ids) } },
      select: { id: true, name: true, role: true },
    })
    for (const s of staffList) staffMap.set(s.id, s)
  }
  const branchMap = new Map(branches.map((b) => [b.id, b.name]))

  const transactions = records.map((r) => ({
    id: r.id,
    delivered_at: r.delivered_at,
    confirmed_at: r.confirmed_at,
    is_confirmed: r.is_confirmed,
    received_by_owner: r.received_by_owner,
    amount: Number(r.amount),
    payment_type: r.payment_type,
    notes: r.notes,
    device_id: r.device_id,
    branch: { id: r.branch_id, name: branchMap.get(r.branch_id) ?? '' },
    from_staff: staffMap.get(r.from_staff_id) ?? { id: r.from_staff_id, name: 'غير معروف', role: 'unknown' },
    to_staff: r.to_staff_id ? (staffMap.get(r.to_staff_id) ?? null) : null,
    confirmed_by_staff: r.confirmed_by ? (staffMap.get(r.confirmed_by) ?? null) : null,
  }))

  const summary = await computeSummary(branchIds)
  return NextResponse.json({ transactions, summary })
}

function emptySummary() {
  return {
    today_total: 0,
    week_total: 0,
    month_total: 0,
    transaction_count: 0,
    pending_count: 0,
  }
}

async function computeSummary(branchIds: string[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const baseWhere = { branch_id: { in: branchIds } }

  const [todayAgg, weekAgg, monthAgg, count, pending] = await Promise.all([
    prisma.deliveryRecord.aggregate({
      _sum: { amount: true },
      where: { ...baseWhere, delivered_at: { gte: startOfToday } },
    }),
    prisma.deliveryRecord.aggregate({
      _sum: { amount: true },
      where: { ...baseWhere, delivered_at: { gte: startOfWeek } },
    }),
    prisma.deliveryRecord.aggregate({
      _sum: { amount: true },
      where: { ...baseWhere, delivered_at: { gte: startOfMonth } },
    }),
    prisma.deliveryRecord.count({
      where: { ...baseWhere, delivered_at: { gte: startOfMonth } },
    }),
    prisma.deliveryRecord.count({
      where: { ...baseWhere, is_confirmed: false },
    }),
  ])

  return {
    today_total: Number(todayAgg._sum.amount ?? 0),
    week_total: Number(weekAgg._sum.amount ?? 0),
    month_total: Number(monthAgg._sum.amount ?? 0),
    transaction_count: count,
    pending_count: pending,
  }
}
