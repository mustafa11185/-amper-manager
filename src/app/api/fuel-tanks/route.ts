import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — list all fuel tanks for the user's generators
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const branchId = req.nextUrl.searchParams.get('branch_id') || user.branchId

  const tanks = await prisma.fuelTank.findMany({
    where: {
      generator: { branch: { tenant_id: user.tenantId }, ...(branchId ? { branch_id: branchId } : {}) },
      is_active: true,
    },
    include: { generator: { select: { id: true, name: true } } },
    orderBy: [{ generator_id: 'asc' }, { sensor_index: 'asc' }],
  })

  return NextResponse.json({ tanks })
}

// POST — create a new fuel tank
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const body = await req.json()
  const { generator_id, name, tank_type, sensor_index, capacity_liters, height_cm, empty_cm, full_cm } = body

  if (!generator_id || !name) {
    return NextResponse.json({ error: 'generator_id و name مطلوبين' }, { status: 400 })
  }

  // Verify generator belongs to tenant
  const gen = await prisma.generator.findFirst({
    where: { id: generator_id, branch: { tenant_id: user.tenantId } },
  })
  if (!gen) return NextResponse.json({ error: 'المولدة غير موجودة' }, { status: 404 })

  const tank = await prisma.fuelTank.create({
    data: {
      generator_id,
      name,
      tank_type: tank_type || 'internal',
      sensor_index: sensor_index ?? 0,
      capacity_liters: capacity_liters || null,
      height_cm: height_cm || 100,
      empty_cm: empty_cm || 100,
      full_cm: full_cm || 5,
    },
  })

  return NextResponse.json({ tank })
}
