// Daily cron: detect generators that haven't shown activity in 24h
// and notify the tenant's owner. Activity = any generator row update
// (fuel reading, run_status toggle, etc.).
//
// Dedupe key includes the day so owners only get one alert per
// generator per day.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST() {
  try {
    const now = new Date()
    const cutoff = new Date(now.getTime() - DAY_MS)
    const dayKey = now.toISOString().slice(0, 10)

    const inactive = await prisma.generator.findMany({
      where: {
        is_active: true,
        run_status: false,
        updated_at: { lt: cutoff },
        branch: { tenant: { is_active: true } },
      },
      include: { branch: { select: { id: true, tenant_id: true } } },
    })

    let notified = 0
    for (const gen of inactive) {
      const hoursIdle = Math.floor((now.getTime() - gen.updated_at.getTime()) / (1000 * 60 * 60))
      const res = await createNotification({
        tenant_id: gen.branch.tenant_id,
        branch_id: gen.branch.id,
        type: 'inactive_generator',
        title: `مولدة غير فعّالة: ${gen.name}`,
        body: `لم نرصد أي نشاط منذ ${hoursIdle} ساعة. تحقّق من حالتها.`,
        payload: {
          generator_id: gen.id,
          generator_name: gen.name,
          hours_idle: hoursIdle,
        },
        dedupe_key: `inactive_gen_${gen.id}_${dayKey}`,
      })
      if (res.created) notified++
    }

    return NextResponse.json({
      ok: true,
      scanned: inactive.length,
      notified,
    })
  } catch (err) {
    console.error('[check-inactive-generators] Error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}
