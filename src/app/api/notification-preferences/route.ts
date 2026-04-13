// Notification preferences API (tenant-scoped via session).
//
// GET  → returns { types: [{ key, label, category, enabled }] }
//        Merges the known catalog with stored preference rows.
// PUT  → body { updates: [{ type, enabled, user_id? }] }
//        Upserts preference rows. If user_id is omitted the update
//        applies to the tenant-wide default (user_id = null).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Catalog of types the user can toggle. Order + grouping is driven by
// this list; new types must be registered here to appear in the UI.
export const NOTIFICATION_CATALOG = [
  { key: 'update_available', label: 'تحديث متاح للتطبيق', category: 'system' },
  { key: 'announcement', label: 'إعلانات من أمبير', category: 'system' },
  { key: 'subscription_expiring', label: 'اشتراك على وشك الانتهاء', category: 'billing' },
  { key: 'subscription_warning', label: 'اشتراك في فترة السماح', category: 'billing' },
  { key: 'subscription_locked', label: 'تم إيقاف الحساب', category: 'billing' },
  { key: 'invoice_generated', label: 'إصدار فواتير شهرية', category: 'billing' },
  { key: 'payment_received', label: 'دفعة جديدة من مشترك', category: 'operations' },
  { key: 'wallet_delivery', label: 'تسليم محفظة', category: 'operations' },
  { key: 'discount_request', label: 'طلب خصم من جابي', category: 'operations' },
  { key: 'discount_approved', label: 'موافقة على خصم', category: 'operations' },
  { key: 'discount_rejected', label: 'رفض خصم', category: 'operations' },
  { key: 'collector_call', label: 'طلب زيارة من مشترك', category: 'operations' },
  { key: 'inactive_generator', label: 'مولدة غير فعّالة', category: 'iot' },
  { key: 'iot_disconnect', label: 'انقطاع اتصال جهاز IoT', category: 'iot' },
  { key: 'device_offline', label: 'جهاز IoT غير متصل', category: 'iot' },
  { key: 'temp_critical', label: 'درجة حرارة حرجة', category: 'iot' },
  { key: 'fuel_critical', label: 'وقود منخفض جداً', category: 'iot' },
] as const

export const CATEGORY_LABELS: Record<string, string> = {
  system: 'النظام',
  billing: 'الاشتراك والفواتير',
  operations: 'العمليات اليومية',
  iot: 'المولدات وIoT',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { tenantId?: string; id?: string }
    | undefined
  if (!user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Load tenant-default prefs (user_id = null). Per-user overrides live
  // under user_id = session user id but the current UI only edits the
  // tenant default, so we skip them here.
  const rows = await prisma.notificationPreference.findMany({
    where: { tenant_id: user.tenantId, user_id: null },
  })
  const byType = new Map(rows.map((r) => [r.type, r.enabled]))

  const types = NOTIFICATION_CATALOG.map((c) => ({
    key: c.key,
    label: c.label,
    category: c.category,
    category_label: CATEGORY_LABELS[c.category] || c.category,
    enabled: byType.get(c.key) ?? true,
  }))

  return NextResponse.json({ types })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { tenantId?: string; id?: string; role?: string }
    | undefined
  if (!user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Only the owner (or admin roles) can change tenant-wide defaults.
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates = body.updates as Array<{ type: string; enabled: boolean }> | undefined
  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 })
  }

  const validKeys = new Set(NOTIFICATION_CATALOG.map((c) => c.key))
  let applied = 0
  for (const u of updates) {
    if (!validKeys.has(u.type as never)) continue
    // Upsert tenant-wide preference (user_id null).
    // Composite unique is (tenant_id, user_id, type).
    await prisma.notificationPreference.upsert({
      where: {
        tenant_id_user_id_type: {
          tenant_id: user.tenantId,
          user_id: null as never,
          type: u.type,
        },
      },
      create: {
        tenant_id: user.tenantId,
        user_id: null,
        user_type: 'owner',
        type: u.type,
        enabled: u.enabled,
      },
      update: { enabled: u.enabled },
    })
    applied++
  }

  return NextResponse.json({ ok: true, applied })
}
