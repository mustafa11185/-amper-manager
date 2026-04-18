import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PUT — update a fuel tank
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // Verify tank belongs to tenant
  const existing = await prisma.fuelTank.findFirst({
    where: { id, generator: { branch: { tenant_id: user.tenantId } } },
  })
  if (!existing) return NextResponse.json({ error: 'الخزان غير موجود' }, { status: 404 })

  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.tank_type !== undefined) data.tank_type = body.tank_type
  if (body.sensor_index !== undefined) data.sensor_index = body.sensor_index
  if (body.capacity_liters !== undefined) data.capacity_liters = body.capacity_liters
  if (body.height_cm !== undefined) data.height_cm = body.height_cm
  if (body.empty_cm !== undefined) data.empty_cm = body.empty_cm
  if (body.full_cm !== undefined) data.full_cm = body.full_cm

  const tank = await prisma.fuelTank.update({ where: { id }, data })
  return NextResponse.json({ tank })
}

// DELETE — soft-delete a fuel tank
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { id } = await params

  const existing = await prisma.fuelTank.findFirst({
    where: { id, generator: { branch: { tenant_id: user.tenantId } } },
  })
  if (!existing) return NextResponse.json({ error: 'الخزان غير موجود' }, { status: 404 })

  await prisma.fuelTank.update({ where: { id }, data: { is_active: false } })
  return NextResponse.json({ ok: true })
}
