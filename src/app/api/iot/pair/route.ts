import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// In-memory rate limiter (per IP, 10 attempts per minute)
// Resets when the server restarts — sufficient for brute-force prevention.
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

// POST /api/iot/pair  Body: { pairing_code }
// Device sends the 6-digit code shown on the manager screen.
// Returns the permanent device_token + sensors_config.
export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
    }

    const { pairing_code } = await req.json()
    if (!pairing_code) {
      return NextResponse.json({ error: 'pairing_code required' }, { status: 400 })
    }

    const device = await prisma.iotDevice.findUnique({
      where: { pairing_code: String(pairing_code) },
      include: { engines: true },
    })

    if (!device) {
      return NextResponse.json({ error: 'رمز الإقران غير صالح' }, { status: 404 })
    }
    if (!device.pairing_expires_at || device.pairing_expires_at < new Date()) {
      return NextResponse.json({ error: 'انتهت صلاحية رمز الإقران' }, { status: 410 })
    }

    // Mark as paired & invalidate the pairing code
    const updated = await prisma.iotDevice.update({
      where: { id: device.id },
      data: {
        paired_at: new Date(),
        pairing_code: null,
        pairing_expires_at: null,
        is_online: true,
        last_seen: new Date(),
      },
    })

    return NextResponse.json({
      device_id: updated.id,
      device_token: updated.device_token,
      name: updated.name,
      generator_id: updated.generator_id,
      engines: device.engines.map(e => ({
        engine_id: e.engine_id,
        temp_pin: e.temp_pin,
        fuel_pin: e.fuel_pin,
        current_pin: e.current_pin,
      })),
      sensors_config: updated.sensors_config,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
