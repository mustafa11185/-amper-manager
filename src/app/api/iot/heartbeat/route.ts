import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Auth helper: Authorization: Bearer <device_token>
async function authDevice(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return prisma.iotDevice.findUnique({ where: { device_token: token } })
}

// POST /api/iot/heartbeat  Body: { firmware? }
export async function POST(req: NextRequest) {
  const device = await authDevice(req)
  if (!device) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const updated = await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      is_online: true,
      last_seen: new Date(),
      last_heartbeat: new Date(),
      ...(body.firmware ? { firmware: body.firmware } : {}),
    },
  })

  return NextResponse.json({ ok: true, device_id: updated.id })
}
