import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PUT — mark resolved + add notes
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { id } = await params

  const existing = await prisma.fuelEvent.findFirst({ where: { id, tenant_id: tenantId } })
  if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const { is_resolved, notes } = await req.json()
  const event = await prisma.fuelEvent.update({
    where: { id },
    data: {
      ...(is_resolved !== undefined ? { is_resolved } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  })

  return NextResponse.json({ event })
}
