import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId

  try {
    // Get branches for this tenant
    const branchFilter = user.role === 'owner'
      ? { tenant_id: tenantId }
      : { id: user.branchId }
    const branches = await prisma.branch.findMany({ where: branchFilter, select: { id: true } })
    const branchIds = branches.map(b => b.id)

    // Get active collectors
    const collectors = await prisma.staff.findMany({
      where: {
        branch_id: { in: branchIds },
        is_active: true,
        role: { in: ['collector'] },
      },
      select: { id: true, name: true, photo_url: true, is_owner_acting: true },
    })

    // For each collector, get latest GPS log
    const results = await Promise.all(
      collectors.map(async (c) => {
        const latest = await prisma.staffGpsLog.findFirst({
          where: { staff_id: c.id },
          orderBy: { recorded_at: 'desc' },
        })

        if (!latest) return null

        // Calculate minutes since last seen
        const minutesAgo = Math.floor(
          (Date.now() - new Date(latest.recorded_at).getTime()) / 60000
        )

        return {
          staff_id: c.id,
          name: c.name,
          photo_url: c.photo_url,
          is_owner: c.is_owner_acting,
          lat: Number(latest.lat),
          lng: Number(latest.lng),
          last_seen: latest.recorded_at.toISOString(),
          minutes_ago: minutesAgo,
          is_stop: latest.is_stop,
          stop_duration_min: latest.stop_duration_min ?? 0,
        }
      })
    )

    return NextResponse.json({
      collectors: results.filter(Boolean),
    })
  } catch (e) {
    console.error('[map/collectors-live]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
