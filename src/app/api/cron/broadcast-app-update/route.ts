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

export async function POST(req: NextRequest) {
  // Optional shared-secret gate
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-cron-key')
    if (key !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const body = (await req.json().catch(() => ({}))) as { app?: string; force?: boolean }
  const app = (body.app || 'staff').toLowerCase()
  const force = body.force === true

  // Pull current version info from the AppVersion table (same source
  // the /api/app-version endpoint uses).
  const av = await prisma.appVersion.findUnique({ where: { app_key: app } })
  if (!av) {
    return NextResponse.json({ error: `no app_version row for ${app}` }, { status: 404 })
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
  })
}
