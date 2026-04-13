import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Master cron scheduler — call this from any external scheduler (cron-job.org, Render Cron, etc.)
// Suggested schedule: every 1 minute
//
// Internally decides which jobs to run based on the current time:
//   - check-iot-alerts: every minute
//   - cleanup-telemetry: once per day at 03:00 (Iraq time = UTC+3 → 00:00 UTC)
//   - check-unpaid-subscribers: once per day at 09:00 Iraq time
//
// Optional: protect with ?key=<CRON_SECRET> if CRON_SECRET env is set.

export async function POST(req: NextRequest) {
  // Optional shared-secret protection
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const key = req.nextUrl.searchParams.get('key')
    if (key !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  // Iraq time (UTC+3)
  const iraqHour = (now.getUTCHours() + 3) % 24
  const iraqMin = now.getUTCMinutes()

  const results: Record<string, any> = {}
  const baseUrl = req.nextUrl.origin

  // Helper to call internal cron endpoints
  async function call(name: string) {
    try {
      const res = await fetch(`${baseUrl}/api/cron/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      results[name] = { status: res.status, ok: res.ok }
      try { results[name].body = await res.json() } catch {}
    } catch (err: any) {
      results[name] = { error: err.message }
    }
  }

  // ── Every minute ──
  await call('check-iot-alerts')

  // ── Daily at 03:00 Iraq time ──
  if (iraqHour === 3 && iraqMin < 5) {
    await call('cleanup-telemetry')
  }

  // ── Daily at 09:00 Iraq time ──
  if (iraqHour === 9 && iraqMin < 5) {
    await call('check-unpaid-subscribers')
    await call('check-subscriptions')
    await call('check-inactive-generators')
  }

  // ── AI Monthly Report: day 25 at 08:00 Iraq time ──
  // Fires BEFORE manual invoice generation (which happens end of month / day 1).
  // Gives the manager 5 days to review the report and decide on actions
  // (distribute partner profits, plan maintenance, etc.) before issuing new invoices.
  if (now.getUTCDate() === 25 && iraqHour === 8 && iraqMin < 5) {
    await call('monthly-report')
  }

  return NextResponse.json({
    ok: true,
    iraq_time: `${iraqHour}:${String(iraqMin).padStart(2, '0')}`,
    results,
  })
}

// Allow GET for easy testing in browser
export async function GET(req: NextRequest) {
  return POST(req)
}
