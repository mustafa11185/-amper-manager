import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const kiosks = await prisma.kioskScreen.findMany({
    where,
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({ kiosks })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const { name, branch_id } = await req.json()
    if (!name || !branch_id) {
      return NextResponse.json({ error: 'الاسم والفرع مطلوبان' }, { status: 400 })
    }

    // Verify branch belongs to tenant — without this, a manager
    // could create a kiosk on any branch id they can guess.
    const ownedBranch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: tenantId },
      select: { id: true },
    })
    if (!ownedBranch) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

    const kiosk = await prisma.kioskScreen.create({
      data: {
        tenant_id: tenantId,
        branch_id,
        name,
        is_active: true,
      },
    })

    return NextResponse.json({ kiosk }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
