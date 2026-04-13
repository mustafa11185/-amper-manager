// Shared branch-scope resolver for reports + tenant-scoped endpoints.
//
// Replaces the common pattern:
//
//   const branches = await prisma.branch.findMany({
//     where: user.role === 'owner'
//       ? { tenant_id: tenantId }
//       : { id: user.branchId },
//   })
//
// which ignored any ?branch_id= query param and always returned
// every branch for owners. That meant the manager dashboard's
// branch switcher had zero effect on reports.
//
// The helper honors this precedence:
//   1. ?branch_id=X query param (scoped to caller's tenant)
//   2. Non-owner session branchId (staff are always locked to
//      their assigned branch)
//   3. Every branch in the tenant (owner, no override)

import type { NextRequest } from 'next/server'
import { prisma } from './prisma'

type SessionUser = {
  id?: string
  role?: string
  tenantId?: string
  branchId?: string
}

export async function resolveBranchIds(
  req: NextRequest,
  user: SessionUser,
): Promise<string[]> {
  const tenantId = user.tenantId
  if (!tenantId) return []

  const qBranch = req.nextUrl.searchParams.get('branch_id')

  // Non-owner roles are always locked to their session branch
  // regardless of the query param. Owners can filter.
  if (user.role !== 'owner') {
    return user.branchId ? [user.branchId] : []
  }

  if (qBranch) {
    // Verify the requested branch belongs to this tenant before
    // trusting it — prevents cross-tenant leakage via URL tampering.
    const b = await prisma.branch.findFirst({
      where: { id: qBranch, tenant_id: tenantId },
      select: { id: true },
    })
    return b ? [b.id] : []
  }

  const all = await prisma.branch.findMany({
    where: { tenant_id: tenantId },
    select: { id: true },
  })
  return all.map((b) => b.id)
}
