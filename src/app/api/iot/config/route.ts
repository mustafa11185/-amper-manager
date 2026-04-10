import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function authDevice(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return prisma.iotDevice.findUnique({
    where: { device_token: token },
    include: { engines: true, generator: true },
  })
}

// GET /api/iot/config — device fetches its config (engines + pin map + sensor calibration)
export async function GET(req: NextRequest) {
  const device = await authDevice(req)
  if (!device) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    device_id: device.id,
    name: device.name,
    generator_id: device.generator_id,
    is_active: device.is_active,
    engines: device.engines.map(e => ({
      engine_id: e.engine_id,
      temp_pin: e.temp_pin,
      fuel_pin: e.fuel_pin,
      current_pin: e.current_pin,
    })),
    // Tank calibration for fuel sensor
    tank: {
      empty_distance_cm: device.generator?.tank_empty_dist_cm ?? 100,
      full_distance_cm: device.generator?.tank_full_dist_cm ?? 10,
      capacity_liters: device.generator?.tank_capacity_liters ?? null,
    },
    sensors_config: device.sensors_config,
  })
}
