// GET /api/cron/check-iot-alerts/status
//
// Returns the most recent execution snapshot of the IoT alerts cron
// (last run timestamp, duration, alerts created, success/failure).
// Used by ops/monitoring to confirm the cron is actually firing on
// schedule. Owner-only since the data exposes internal counts.
//
// The snapshot lives in module-scoped memory inside the parent
// route, so it survives between invocations on a warm Vercel
// instance but resets after a cold start. For long-term history
// the recommended approach is to query Notification rows of
// type='oil_*' or 'fuel_*' over the last 24h.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLastCronRun } from '../route'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const last = getLastCronRun()
  if (!last) {
    return NextResponse.json({
      ok: true,
      ran_yet: false,
      message: 'لم يتم تشغيل المهمة بعد منذ آخر cold start. ستعمل تلقائياً عند التشغيل القادم.',
    })
  }

  const ageMs = Date.now() - new Date(last.finished_at).getTime()
  const ageMinutes = Math.floor(ageMs / 60000)
  const ageHours = Math.floor(ageMinutes / 60)

  return NextResponse.json({
    ran_yet: true,
    ...last,
    age: {
      minutes: ageMinutes,
      hours: ageHours,
      label: ageHours > 0 ? `منذ ${ageHours} ساعة` : `منذ ${ageMinutes} دقيقة`,
    },
    healthy: last.ok && ageHours < 2,
  })
}
