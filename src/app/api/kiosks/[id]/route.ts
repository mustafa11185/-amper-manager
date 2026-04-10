import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string
  const { id } = await params

  const k = await prisma.kioskScreen.findFirst({ where: { id, tenant_id: tenantId } })
  if (!k) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  await prisma.kioskScreen.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string
  const { id } = await params

  try {
    const { name, is_active, regenerate_token } = await req.json()
    const k = await prisma.kioskScreen.findFirst({ where: { id, tenant_id: tenantId } })
    if (!k) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    const kiosk = await prisma.kioskScreen.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
        ...(regenerate_token ? { token: randomUUID() } : {}),
      },
    })
    return NextResponse.json({ kiosk })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
