// POST /api/staff/visit-log
// Records a non-payment visit attempt by a collector (subscriber not
// home, refused, locked, etc.). Tenant-scoped via session.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as { id?: string; tenantId?: string; branchId?: string }
  if (!user.tenantId || !user.branchId) {
    return NextResponse.json({ error: 'tenant or branch missing' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const subscriberId = body.subscriber_id?.toString()
  const reason = body.reason?.toString()
  if (!subscriberId || !reason) {
    return NextResponse.json({ error: 'subscriber_id and reason are required' }, { status: 400 })
  }

  // Verify the subscriber belongs to this tenant.
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: { tenant_id: true, branch_id: true },
  })
  if (!subscriber || subscriber.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'subscriber_not_found' }, { status: 404 })
  }

  const log = await prisma.visitLog.create({
    data: {
      tenant_id: user.tenantId,
      branch_id: subscriber.branch_id,
      subscriber_id: subscriberId,
      staff_id: user.id ?? null,
      reason,
      notes: body.notes?.toString() ?? null,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
    },
  })

  return NextResponse.json({ ok: true, id: log.id })
}
