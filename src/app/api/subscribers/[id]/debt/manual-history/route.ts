import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Returns manually-added debt entries for a subscriber, newest first.
// Owner-only — these reveal admin actions on the account.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = session.user as any
    if (user.role !== 'owner') return NextResponse.json({ error: 'المالك فقط' }, { status: 403 })

    const { id } = await params

    const subscriber = await prisma.subscriber.findFirst({
      where: { id, tenant_id: user.tenantId },
      select: { id: true },
    })
    if (!subscriber) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    const logs = await prisma.auditLog.findMany({
      where: {
        tenant_id: user.tenantId,
        entity_type: 'subscriber',
        entity_id: id,
        action: 'manual_debt_added',
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    })

    // Resolve actor names. Owners log their tenant.id as actor_id (see
    // auth.ts line 66), staff log their staff.id. Look up both in one
    // batched query each so the list renders in a single round-trip.
    const actorIds = Array.from(new Set(logs.map((l) => l.actor_id).filter((x): x is string => !!x)))
    const actorById = new Map<string, string>()
    if (actorIds.length) {
      const [owners, staffMembers] = await Promise.all([
        prisma.tenant.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, owner_name: true },
        }),
        prisma.staff.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        }),
      ])
      for (const o of owners) actorById.set(o.id, o.owner_name || 'المالك')
      for (const s of staffMembers) actorById.set(s.id, s.name)
    }

    const items = logs.map((l) => {
      const v = (l.new_value ?? {}) as { amount?: number; reason?: string | null }
      return {
        id: l.id,
        amount: Number(v.amount ?? 0),
        reason: v.reason ?? null,
        added_at: l.created_at,
        added_by: l.actor_id ? actorById.get(l.actor_id) ?? null : null,
      }
    })

    return NextResponse.json({ ok: true, items })
  } catch (error) {
    console.error('[debt/manual-history] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
