import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const generator = await prisma.generator.findUnique({
    where: { id },
    include: { branch: { select: { name: true } } },
  })
  if (!generator) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  return NextResponse.json({ generator })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.fuel_level_pct !== undefined) data.fuel_level_pct = body.fuel_level_pct
    if (body.tank_full_dist_cm !== undefined) data.tank_full_dist_cm = body.tank_full_dist_cm
    if (body.tank_empty_dist_cm !== undefined) data.tank_empty_dist_cm = body.tank_empty_dist_cm
    if (body.manual_override_allowed !== undefined) data.manual_override_allowed = body.manual_override_allowed

    const generator = await prisma.generator.update({ where: { id }, data })
    return NextResponse.json({ generator })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
