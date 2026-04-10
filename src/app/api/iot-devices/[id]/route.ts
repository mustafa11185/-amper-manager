import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { id } = await params

  const device = await prisma.iotDevice.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      generator: { select: { id: true, name: true } },
      engines: { include: { engine: { select: { id: true, name: true } } } },
    },
  })
  if (!device) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  // Latest telemetry per engine
  const engineIds = device.engines.map(e => e.engine_id)
  const telemetryByEngine: Record<string, any> = {}
  for (const eid of engineIds) {
    const t = await prisma.iotTelemetry.findFirst({
      where: { device_id: id, engine_id: eid },
      orderBy: { recorded_at: 'desc' },
    })
    if (t) telemetryByEngine[eid] = t
  }

  // Recent telemetry feed (last 50)
  const recent = await prisma.iotTelemetry.findMany({
    where: { device_id: id },
    orderBy: { recorded_at: 'desc' },
    take: 50,
  })

  return NextResponse.json({ device, telemetry_by_engine: telemetryByEngine, recent_telemetry: recent })
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
    const body = await req.json()
    const { name, is_active, engine_ids } = body

    const existing = await prisma.iotDevice.findFirst({ where: { id, tenant_id: tenantId } })
    if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    const device = await prisma.iotDevice.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
      },
    })

    // Replace engine links if provided
    if (Array.isArray(engine_ids)) {
      await prisma.iotDeviceEngine.deleteMany({ where: { device_id: id } })
      if (engine_ids.length > 0) {
        await prisma.iotDeviceEngine.createMany({
          data: engine_ids.map((eid: string) => ({ device_id: id, engine_id: eid })),
        })
      }
    }

    return NextResponse.json({ device })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string
  const { id } = await params

  const existing = await prisma.iotDevice.findFirst({ where: { id, tenant_id: tenantId } })
  if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  await prisma.iotDevice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
