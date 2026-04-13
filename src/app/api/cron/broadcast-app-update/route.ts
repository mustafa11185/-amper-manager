// POST /api/cron/broadcast-app-update
//
// One-shot broadcast: creates an `update_available` notification for
// every active tenant's primary branch, plus fires an FCM push to every
// staff member so the bell badge lights up even on clients that are
// currently closed. Deduped by (tenant_id, `update_${app}_${version}`)
// so repeat calls are no-ops.
//
// Protected by CRON_SECRET when the env is set. Call after publishing
// a new APK + updating the AppVersion row to push the notification
// fleet-wide without waiting for the next client poll.
//
// Body (optional): { app?: "staff"|"iot"|"partner", force?: boolean }
// force=true bypasses the dedupe check (use only if a previous broadcast
// was wrong and you need to re-emit).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { sendPushToBranch, pushTemplates } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Same shape as the fallback in /api/app-version — used when the
// AppVersion table hasn't been seeded yet on a given environment
// (e.g. production DB on Render doesn't have the row yet).
const FALLBACK_APP_INFO: Record<
  string,
  { min_version: string; latest_version: string; update_url: string | null; changelog_ar: string | null; force: boolean }
> = {
  staff: {
    min_version: '2.7.0',
    latest_version: '2.8.0',
    update_url: 'https://github.com/mustafa11185/amper-flutter-releases/releases/download/v2.8.0/Amper-v2.8.0.apk',
    changelog_ar: 'واجهة المحركات الجديدة: بطاقة لكل محرك بقراءات حيّة (حرارة/حمل/ضغط) + شاشة تفاصيل 4 تبويبات (نظرة عامة/صيانة/قراءات/أحداث) + رسوم بيانية زمنية + تفضيلات التنبيهات + نظام تحديث موحّد',
    force: false,
  },
  iot: {
    min_version: '1.0.0',
    latest_version: '1.0.0',
    update_url: null,
    changelog_ar: 'الإصدار الأولي',
    force: false,
  },
  partner: {
    min_version: '1.0.0',
    latest_version: '1.0.0',
    update_url: null,
    changelog_ar: 'الإصدار الأولي',
    force: false,
  },
}

export async function POST(req: NextRequest) {
  // Optional shared-secret gate
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-cron-key')
    if (key !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const body = (await req.json().catch(() => ({}))) as {
    app?: string
    force?: boolean
    purge_existing?: boolean
  }
  const app = (body.app || 'staff').toLowerCase()
  const force = body.force === true
  const purgeExisting = body.purge_existing === true

  // Pull current version info from the AppVersion table, falling
  // back to the hardcoded constants if the row hasn't been seeded on
  // this environment yet (e.g. production DB without a UI edit).
  const row = await prisma.appVersion.findUnique({ where: { app_key: app } }).catch(() => null)
  const fb = FALLBACK_APP_INFO[app]
  if (!row && !fb) {
    return NextResponse.json({ error: `unknown app "${app}"` }, { status: 400 })
  }
  const av = row
    ? {
        min_version: row.min_version,
        latest_version: row.latest_version,
        update_url: row.update_url,
        changelog_ar: row.changelog_ar,
        force: row.force,
      }
    : fb!

  // Optional: wipe stale update_available rows so we can re-broadcast
  // with a fresh URL. Used when a previous broadcast wrote a payload
  // pointing at the wrong place (e.g. a typo or a private repo URL)
  // and we need every device to see the corrected one. Only deletes
  // rows whose payload.app matches the broadcasted app, so other
  // notification types and other apps are untouched.
  let purgedCount = 0
  if (purgeExisting) {
    const result = await prisma.notification.deleteMany({
      where: {
        type: 'update_available',
        // payload->>app filter — Postgres JSON path
        payload: { path: ['app'], equals: app },
      },
    })
    purgedCount = result.count
  }

  // Active tenants only — skip locked/inactive ones.
  const tenants = await prisma.tenant.findMany({
    where: { is_active: true },
    select: { id: true },
  })
  if (tenants.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, tenants: 0 })
  }

  // For each tenant, pick the oldest active branch as the target.
  const branches = await prisma.branch.findMany({
    where: { tenant_id: { in: tenants.map((t) => t.id) }, is_active: true },
    orderBy: { created_at: 'asc' },
    select: { id: true, tenant_id: true },
  })
  const primaryBranchByTenant = new Map<string, string>()
  for (const b of branches) {
    if (!primaryBranchByTenant.has(b.tenant_id)) {
      primaryBranchByTenant.set(b.tenant_id, b.id)
    }
  }

  let notified = 0
  let skipped = 0
  let pushed = 0
  const dedupeBase = `update_${app}_${av.latest_version}`
  const dedupeKey = force ? `${dedupeBase}_${Date.now()}` : dedupeBase

  const tpl = pushTemplates.updateAvailable(av.latest_version, av.changelog_ar)

  for (const t of tenants) {
    const branch_id = primaryBranchByTenant.get(t.id)
    if (!branch_id) {
      skipped++
      continue
    }
    const result = await createNotification({
      tenant_id: t.id,
      branch_id,
      type: 'update_available',
      title: `تحديث ${av.latest_version} متاح`,
      body:
        av.changelog_ar ||
        `إصدار جديد من تطبيق أمبير متاح: ${av.latest_version}`,
      payload: {
        app,
        latest_version: av.latest_version,
        min_version: av.min_version,
        update_url: av.update_url,
        force: av.force,
      },
      dedupe_key: dedupeKey,
    })
    if (result.created) {
      notified++
      // Fan out an FCM push to every staff member of the branch so the
      // user gets a system-level notification even when the app is
      // backgrounded or closed.
      try {
        await sendPushToBranch({
          branch_id,
          title: tpl.title,
          body: tpl.body,
          data: {
            type: 'update_available',
            app,
            version: av.latest_version,
            url: av.update_url || '',
          },
        })
        pushed++
      } catch (e) {
        console.warn('[broadcast-app-update] push failed:', e)
      }
    } else {
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    app,
    latest_version: av.latest_version,
    tenants: tenants.length,
    notified,
    skipped,
    pushed,
    purged: purgedCount,
  })
}
