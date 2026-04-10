import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

// Generate a 6-digit pairing code
function genPairingCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// IoT device limit per plan (mirrors plan_limits.dart)
function maxIotDevicesForPlan(plan: string | null | undefined): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'pro':
    case 'gold':       // legacy
      return 1
    case 'business':
      return 5
    case 'corporate':
    case 'fleet':
    case 'custom':
      return 9999
    default:
      return 0  // starter / basic
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const where: any = { tenant_id: tenantId }
  if (user.role !== 'owner' && branchId) where.branch_id = branchId

  const qBranch = req.nextUrl.searchParams.get('branch_id')
  if (qBranch) where.branch_id = qBranch

  const devices = await prisma.iotDevice.findMany({
    where,
    include: {
      generator: { select: { id: true, name: true } },
      engines: {
        include: { engine: { select: { id: true, name: true } } },
      },
    },
    orderBy: { created_at: 'desc' },
  })

  // For each device, fetch latest telemetry per engine
  const enriched = await Promise.all(devices.map(async (d) => {
    const latestTele = await prisma.iotTelemetry.findFirst({
      where: { device_id: d.id },
      orderBy: { recorded_at: 'desc' },
    })
    return { ...d, latest_telemetry: latestTele }
  }))

  return NextResponse.json({ devices: enriched })
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
    const body = await req.json()
    const { name, generator_id, branch_id, engine_ids, device_type } = body

    if (!name || !generator_id || !branch_id) {
      return NextResponse.json({ error: 'الحقول المطلوبة: الاسم، المولدة، الفرع' }, { status: 400 })
    }

    // ── Plan limit check ──
    const max = maxIotDevicesForPlan(user.plan)
    if (max === 0) {
      return NextResponse.json(
        { error: 'باقتك الحالية لا تدعم أجهزة IoT — قم بالترقية لباقة Pro أو أعلى' },
        { status: 403 }
      )
    }
    const currentCount = await prisma.iotDevice.count({ where: { tenant_id: tenantId } })
    if (currentCount >= max) {
      return NextResponse.json(
        { error: `وصلت للحد الأقصى من الأجهزة في باقتك (${max}) — قم بالترقية للمزيد` },
        { status: 403 }
      )
    }

    // Generate unique pairing code (retry on collision)
    let pairingCode = genPairingCode()
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.iotDevice.findUnique({ where: { pairing_code: pairingCode } })
      if (!exists) break
      pairingCode = genPairingCode()
    }

    // Pairing code valid for 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    const device = await prisma.iotDevice.create({
      data: {
        tenant_id: tenantId,
        branch_id,
        generator_id,
        name,
        device_type: device_type || 'esp32',
        device_token: randomBytes(32).toString('hex'),
        pairing_code: pairingCode,
        pairing_expires_at: expiresAt,
        is_active: true,
        is_online: false,
      },
    })

    // Link engines (junction table)
    if (Array.isArray(engine_ids) && engine_ids.length > 0) {
      await prisma.iotDeviceEngine.createMany({
        data: engine_ids.map((eid: string) => ({
          device_id: device.id,
          engine_id: eid,
        })),
      })
    }

    return NextResponse.json({ device }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
