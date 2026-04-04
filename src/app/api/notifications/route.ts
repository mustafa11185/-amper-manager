import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const branchFilter = user.role === 'owner'
    ? { tenant_id: tenantId }
    : { id: branchId }

  const branches = await prisma.branch.findMany({
    where: branchFilter,
    select: { id: true },
  })
  const branchIds = branches.map(b => b.id)

  const searchParams = req.nextUrl.searchParams
  const typeFilter = searchParams.get('type')

  const where: any = {
    branch_id: { in: branchIds },
    AND: [] as any[],
  }

  // الموظف يرى فقط الإشعارات المتعلقة به
  if (user.role !== 'owner' && user.role !== 'manager') {
    where.AND.push({ type: { in: [
      'discount_approved',
      'discount_rejected',
      'announcement_to_staff',
      'shift_reminder',
      'salary_ready',
      'task_assigned',
    ]}})
  }

  if (typeFilter && typeFilter !== 'all') {
    if (typeFilter === 'alert') {
      where.AND.push({ type: { in: ['temp_warning', 'temp_critical', 'fuel_warning', 'fuel_critical', 'device_offline'] }})
    } else if (typeFilter === 'warning') {
      where.AND.push({ type: { in: ['temp_warning', 'fuel_warning', 'oil_change_due'] }})
    } else if (typeFilter === 'info') {
      where.AND.push({ type: { notIn: ['temp_warning', 'temp_critical', 'fuel_warning', 'fuel_critical', 'device_offline', 'oil_change_due'] }})
    }
  }

  if (where.AND.length === 0) delete where.AND

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
    include: {
      branch: { select: { name: true } },
    },
  })

  return NextResponse.json({ notifications })
}
