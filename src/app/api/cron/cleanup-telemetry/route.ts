import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Delete IoT telemetry rows older than 30 days.
// Keeps the table from growing indefinitely (1 device = ~43k rows/month).
const RETENTION_DAYS = 30

export async function POST() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const result = await prisma.iotTelemetry.deleteMany({
      where: { recorded_at: { lt: cutoff } },
    })

    return NextResponse.json({ ok: true, deleted: result.count, cutoff: cutoff.toISOString() })
  } catch (err: any) {
    console.error('[cron/cleanup-telemetry]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
