import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { verifyCronAuth } from '@/lib/cron-auth'

const DAY_MS = 24 * 60 * 60 * 1000
// Days-before-expiry at which to notify the owner (one notification per day).
const EXPIRY_WARNING_DAYS = [7, 3, 1]

export async function POST(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;
  try {
    const now = new Date()
    const tenants = await prisma.tenant.findMany({
      where: { is_active: true, subscription_ends_at: { not: null } },
    })

    let gracePeriodCount = 0
    let lockedCount = 0
    let expiringWarned = 0

    for (const tenant of tenants) {
      const subEnd = tenant.subscription_ends_at!
      const graceEnd = tenant.grace_period_ends_at
        ?? new Date(subEnd.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days grace

      // Proactive expiry warning — BEFORE subscription ends.
      if (now < subEnd) {
        const daysLeft = Math.ceil((subEnd.getTime() - now.getTime()) / DAY_MS)
        if (EXPIRY_WARNING_DAYS.includes(daysLeft)) {
          const branch = await prisma.branch.findFirst({
            where: { tenant_id: tenant.id, is_active: true },
          })
          if (branch) {
            const res = await createNotification({
              tenant_id: tenant.id,
              branch_id: branch.id,
              type: 'subscription_expiring',
              title: `اشتراكك ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`,
              body: `اشتراك أمبير ينتهي في ${subEnd.toLocaleDateString('ar-IQ')}. جدّد الآن لتجنّب الإيقاف.`,
              payload: { days_left: daysLeft, ends_at: subEnd.toISOString() },
              dedupe_key: `sub_expiring_${tenant.id}_${daysLeft}`,
            })
            if (res.created) expiringWarned++
          }
        }
      }

      if (now > subEnd && now <= graceEnd) {
        // In grace period
        if (!tenant.is_in_grace_period) {
          const daysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              is_in_grace_period: true,
              grace_period_ends_at: graceEnd,
            },
          })

          // Get owner's branch for notification
          const branch = await prisma.branch.findFirst({
            where: { tenant_id: tenant.id, is_active: true },
          })
          if (branch) {
            await createNotification({
              tenant_id: tenant.id,
              branch_id: branch.id,
              type: 'subscription_warning',
              title: 'اشتراك على وشك الانتهاء ⚠️',
              body: `⚠️ اشتراكك انتهى — لديك ${daysLeft} أيام للتجديد`,
              payload: { days_left: daysLeft, grace_ends: graceEnd.toISOString() },
              dedupe_key: `sub_grace_${tenant.id}_${graceEnd.toISOString().slice(0, 10)}`,
            })
          }
          gracePeriodCount++
        }
      } else if (now > graceEnd) {
        // Past grace period — lock
        if (tenant.is_active) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              is_active: false,
              locked_at: now,
              is_in_grace_period: false,
            },
          })

          const branch = await prisma.branch.findFirst({
            where: { tenant_id: tenant.id },
          })
          if (branch) {
            await createNotification({
              tenant_id: tenant.id,
              branch_id: branch.id,
              type: 'subscription_locked',
              title: 'تم إيقاف الحساب 🔴',
              body: '🔴 تم إيقاف حسابك — تواصل مع أمبير للتجديد',
              dedupe_key: `sub_locked_${tenant.id}`,
            })
          }
          lockedCount++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      grace_period: gracePeriodCount,
      locked: lockedCount,
      expiring_warned: expiringWarned,
    })
  } catch (err: any) {
    console.error('[check-subscriptions] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
