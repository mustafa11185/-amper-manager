import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const branches = await prisma.branch.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: {
      id: true,
      name: true,
      address: true,
      whatsapp_number: true,
      generators: {
        where: { is_active: true },
        select: { id: true, name: true },
      },
      _count: { select: { subscribers: { where: { is_active: true } } } },
    },
  })

  return NextResponse.json({ branches })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'المالك فقط' }, { status: 403 })

  try {
    const { name, address } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })

    const branch = await prisma.branch.create({
      data: { tenant_id: user.tenantId, name: name.trim(), address: address || null },
    })
    return NextResponse.json({ branch }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
