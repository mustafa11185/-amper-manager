import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function authDevice(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return prisma.iotDevice.findUnique({ where: { device_token: token } })
}

// POST /api/iot/telemetry
// Body (single):
//   { engine_id?, temperature_c?, fuel_pct?, current_a?, voltage_v?, oil_status?, run_status? }
// Body (batch):
//   { readings: [{ engine_id, ... }, ...] }
export async function POST(req: NextRequest) {
  const device = await authDevice(req)
  if (!device) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const readings: any[] = Array.isArray(body.readings) ? body.readings : [body]

    const created = await prisma.iotTelemetry.createMany({
      data: readings.map(r => ({
        device_id: device.id,
        engine_id: r.engine_id ?? null,
        temperature_c: r.temperature_c ?? null,
        fuel_pct: r.fuel_pct ?? null,
        current_a: r.current_a ?? null,
        voltage_v: r.voltage_v ?? null,
        oil_status: r.oil_status ?? null,
        oil_pressure_bar: r.oil_pressure_bar ?? null,
        run_status: r.run_status ?? null,
      })),
    })

    await prisma.iotDevice.update({
      where: { id: device.id },
      data: { is_online: true, last_seen: new Date(), last_telemetry: new Date() },
    })

    return NextResponse.json({ ok: true, count: created.count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
