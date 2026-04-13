// Centralized notification creation helper.
//
// Responsibilities:
//   1. Respect NotificationPreference opt-outs (tenant-wide or per-user).
//   2. Dedupe by (tenant_id, dedupe_key) when a key is provided, so
//      recurring checks (e.g. "update 2.7.0 available") only fire once.
//   3. Optionally fan-out push + WhatsApp in the same call.
//
// Prefer this helper over calling `prisma.notification.create` directly
// so that future cross-cutting behavior (audit log, rate-limit, etc.)
// lives in one place.

import { prisma } from './prisma'

export type CreateNotificationInput = {
  tenant_id: string
  branch_id: string
  type: string
  title?: string | null
  body: string
  payload?: Record<string, unknown> | null
  /** If set, the row is upserted on (tenant_id, dedupe_key). */
  dedupe_key?: string | null
  /** If set, the helper checks this user's preference row (falls back to tenant default). */
  user_id?: string | null
}

export type CreateNotificationResult =
  | { created: true; notification_id: string }
  | { created: false; reason: 'disabled' | 'duplicate' }

/** Check if a notification type is enabled for this user/tenant. */
export async function isNotificationEnabled(
  tenant_id: string,
  type: string,
  user_id?: string | null,
): Promise<boolean> {
  // 1) per-user override
  if (user_id) {
    const userPref = await prisma.notificationPreference.findUnique({
      where: {
        tenant_id_user_id_type: { tenant_id, user_id, type },
      },
    })
    if (userPref) return userPref.enabled
  }

  // 2) tenant-wide default (user_id is null in DB)
  const tenantPref = await prisma.notificationPreference.findUnique({
    where: {
      tenant_id_user_id_type: { tenant_id, user_id: null, type } as never,
    },
  }).catch(() => null)

  if (tenantPref) return tenantPref.enabled

  // 3) default: enabled
  return true
}

/** Create a notification, honoring preferences + dedupe. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const enabled = await isNotificationEnabled(
    input.tenant_id,
    input.type,
    input.user_id ?? null,
  )
  if (!enabled) {
    return { created: false, reason: 'disabled' }
  }

  // Dedupe path: upsert by (tenant_id, dedupe_key)
  if (input.dedupe_key) {
    try {
      const existing = await prisma.notification.findUnique({
        where: {
          tenant_id_dedupe_key: {
            tenant_id: input.tenant_id,
            dedupe_key: input.dedupe_key,
          },
        },
      })
      if (existing) {
        return { created: false, reason: 'duplicate' }
      }
    } catch {
      // index not found — fall through to create
    }
  }

  const row = await prisma.notification.create({
    data: {
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      type: input.type,
      title: input.title ?? null,
      body: input.body,
      payload: (input.payload ?? null) as never,
      dedupe_key: input.dedupe_key ?? null,
    },
  })

  return { created: true, notification_id: row.id }
}
