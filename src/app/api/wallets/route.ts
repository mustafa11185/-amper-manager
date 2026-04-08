import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = req.nextUrl.searchParams.get('branch_id') || user.branchId

  // Regular staff can only see their own wallet
  if (user.role !== 'owner' && user.role !== 'accountant' && user.role !== 'manager') {
    const myWallet = await prisma.collectorWallet.findUnique({
      where: { staff_id: user.id },
    })
    if (!myWallet || myWallet.tenant_id !== tenantId) {
      return NextResponse.json({ wallets: [] })
    }
    const staffRecord = await prisma.staff.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, role: true, is_owner_acting: true },
    })
    return NextResponse.json({ wallets: [{ ...myWallet, staff: staffRecord || null }] })
  }

  const where: any = { tenant_id: tenantId }
  if (branchId) where.branch_id = branchId

  const wallets = await prisma.collectorWallet.findMany({ where })

  // Fetch staff names for each wallet
  const staffIds = wallets.map(w => w.staff_id)
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true, role: true, is_owner_acting: true },
  })
  const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]))

  const walletsWithStaff = wallets.map(w => ({
    ...w,
    staff: staffMap[w.staff_id] || null,
  }))

  return NextResponse.json({ wallets: walletsWithStaff })
}
