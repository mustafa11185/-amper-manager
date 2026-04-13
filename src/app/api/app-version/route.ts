// GET /api/app-version?app=staff|iot|partner
//
// Unified version endpoint for all Amper apps. Each client polls this
// and compares its own version against min_version (force) / latest_version
// (soft). Public — no auth required.
//
// Managed via company-admin → Settings → App Versions.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const FALLBACK: Record<string, AppVersionPayload> = {
  staff: {
    min_version: '2.6.0',
    latest_version: '2.7.0',
    update_url: 'https://github.com/mustafa11185/amper-flutter/releases/latest/download/Amper-v2.7.0.apk',
    changelog_ar: 'فحص شامل + إصلاحات حرجة + تحسينات الأداء والواجهة',
    changelog_en: null,
    force: false,
  },
  iot: {
    min_version: '1.0.0',
    latest_version: '1.0.0',
    update_url: null,
    changelog_ar: 'الإصدار الأولي',
    changelog_en: null,
    force: false,
  },
  partner: {
    min_version: '1.0.0',
    latest_version: '1.0.0',
    update_url: null,
    changelog_ar: 'الإصدار الأولي',
    changelog_en: null,
    force: false,
  },
}

type AppVersionPayload = {
  min_version: string
  latest_version: string
  update_url: string | null
  changelog_ar: string | null
  changelog_en: string | null
  force: boolean
}

function parseVer(v: string): number[] {
  return v.split('.').map((p) => parseInt(p, 10) || 0)
}

function isLower(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    const av = a[i] || 0
    const bv = b[i] || 0
    if (av < bv) return true
    if (av > bv) return false
  }
  return false
}

export async function GET(req: NextRequest) {
  const app = (req.nextUrl.searchParams.get('app') || 'staff').toLowerCase()
  const current = req.nextUrl.searchParams.get('current') || ''
  const fallback = FALLBACK[app] || FALLBACK.staff

  let payload: AppVersionPayload & { app_key: string; released_at?: Date }
  try {
    const row = await prisma.appVersion.findUnique({ where: { app_key: app } })
    if (row) {
      payload = {
        app_key: row.app_key,
        min_version: row.min_version,
        latest_version: row.latest_version,
        update_url: row.update_url,
        changelog_ar: row.changelog_ar,
        changelog_en: row.changelog_en,
        force: row.force,
        released_at: row.released_at,
      }
    } else {
      payload = { app_key: app, ...fallback }
    }
  } catch (e) {
    console.error('[app-version] DB read failed, using fallback:', e)
    payload = { app_key: app, ...fallback }
  }

  // Opportunistic side-effect: if the caller passes ?current=X.Y.Z and
  // is an authenticated session user whose current version is lower than
  // latest, write a deduped `update_available` notification so the bell
  // / notifications list surfaces it too (not just the banner).
  if (current) {
    try {
      const cur = parseVer(current)
      const latest = parseVer(payload.latest_version)
      if (isLower(cur, latest)) {
        const session = await getServerSession(authOptions)
        const user = session?.user as
          | { tenantId?: string; branchId?: string; id?: string }
          | undefined
        if (user?.tenantId && user.branchId) {
          await createNotification({
            tenant_id: user.tenantId,
            branch_id: user.branchId,
            type: 'update_available',
            title: `تحديث ${payload.latest_version} متاح`,
            body:
              payload.changelog_ar ||
              `إصدار جديد من التطبيق متاح: ${payload.latest_version}`,
            payload: {
              app: app,
              latest_version: payload.latest_version,
              update_url: payload.update_url,
              force: payload.force,
            },
            dedupe_key: `update_${app}_${payload.latest_version}`,
          })
        }
      }
    } catch (e) {
      // Non-fatal — never block version response on notification write.
      console.warn('[app-version] notification side-effect failed:', e)
    }
  }

  return NextResponse.json(payload)
}
