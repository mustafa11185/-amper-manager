// Shared notification visibility filter used by:
//   - GET /api/notifications (list)
//   - GET /api/notifications/count
//   - PUT /api/notifications/read-all
//
// Without a single source of truth the three endpoints drifted: count
// returned everything in the branch but the list filtered to a small
// allowed set for staff. Owners/managers got "phantom" badges on the
// bell with nothing in the list to mark read.
//
// Returns a Prisma `where` clause that scopes the query by:
//   1. Branch (owner sees all branches in the tenant; staff sees only
//      their assigned branch).
//   2. Type whitelist for non-owner roles (collector / operator /
//      cashier / accountant) — they only see notifications relevant
//      to their work.
//
// Owners/managers see every notification in the tenant except staff
// personal events (discount approvals targeted at a specific staff).

import { prisma } from './prisma'

type SessionUser = {
  id?: string
  role?: string
  tenantId?: string
  branchId?: string
}

// Notification types every role (including staff) should see.
const SHARED_TYPES = [
  // App lifecycle
  'update_available',
  'announcement',
  // Subscription state — every user should know if the account is
  // about to be locked.
  'subscription_warning',
  'subscription_expiring',
  'subscription_locked',
  'subscription_reactivated',
] as const

// Personal types — visible only when payload.staff_id matches the user.
const PERSONAL_TYPES = [
  'discount_approved',
  'discount_rejected',
  'salary_ready',
  'salary_paid',
  'task_assigned',
  // Per-staff wallet and delivery events
  'wallet_delivery',
  'wallet_threshold',
  'delivery',
  // Payment confirmations directed at the collector who took the payment
  'payment_confirmed',
  'payment_online_collector',
] as const

// Staff-only broadcast types (no per-user payload check).
const STAFF_BROADCAST_TYPES = [
  'announcement_to_staff',
  'shift_reminder',
  // Generation outcome — collectors need to know invoices dropped
  'invoice_generated',
  // Operational alerts the whole branch team should see
  'inactive_generator',
] as const

export async function buildNotificationFilter(user: SessionUser) {
  const tenantId = user.tenantId
  const branchId = user.branchId
  if (!tenantId) return null

  // Branch scope.
  const branchFilter = user.role === 'owner'
    ? { tenant_id: tenantId }
    : branchId
      ? { id: branchId }
      : { tenant_id: tenantId }

  const branches = await prisma.branch.findMany({
    where: branchFilter,
    select: { id: true },
  })
  const branchIds = branches.map((b) => b.id)
  if (branchIds.length === 0) return { branchIds: [] as string[], where: null }

  const where: Record<string, unknown> = {
    branch_id: { in: branchIds },
  }

  if (user.role === 'owner' || user.role === 'manager') {
    // Owners/managers see everything in their branch(es) EXCEPT staff
    // personal types — those are noise for them.
    where.AND = [
      { type: { notIn: [...PERSONAL_TYPES] } },
    ]
  } else {
    // Staff see only the curated whitelist + their own personal items.
    where.AND = [
      {
        OR: [
          { type: { in: [...SHARED_TYPES, ...STAFF_BROADCAST_TYPES] } },
          {
            type: { in: [...PERSONAL_TYPES] },
            payload: { path: ['staff_id'], equals: user.id },
          },
        ],
      },
    ]
  }

  return { branchIds, where }
}
