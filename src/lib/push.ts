import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { prisma } from './prisma'
import path from 'path'
import fs from 'fs'

// Initialize Firebase Admin SDK
// Priority: env JSON string > env file path
if (getApps().length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      initializeApp({ credential: cert(serviceAccount) })
      console.log('[Firebase] Admin SDK initialized from env variable')
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const fullPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      if (fs.existsSync(fullPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
        initializeApp({ credential: cert(serviceAccount) })
        console.log('[Firebase] Admin SDK initialized from file')
      } else {
        console.warn(`[Firebase] Service account file not found: ${fullPath}`)
      }
    } else {
      console.warn('[Firebase] No service account configured — push disabled')
    }
  } catch (e) {
    console.error('[Firebase] Init error:', e)
  }
}

/**
 * Send push notification to a staff member
 */
export async function sendPushNotification({
  staff_id,
  title,
  body,
  data,
}: {
  staff_id: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const devices = await prisma.staffDevice.findMany({
      where: { staff_id, is_active: true },
    })

    if (!devices.length) return

    const tokens = devices.map(d => d.fcm_token)

    if (getApps().length === 0) {
      console.log(`[push] Firebase not configured — would send "${title}" to ${tokens.length} devices`)
      return
    }

    try {
      const messaging = getMessaging()
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
      })

      // Clean up invalid tokens
      result.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
          prisma.staffDevice.updateMany({
            where: { fcm_token: tokens[idx] },
            data: { is_active: false },
          }).catch(() => {})
        }
      })

      console.log(`[push] Sent to ${result.successCount}/${tokens.length} devices for staff ${staff_id}`)
    } catch (e) {
      console.error('[push] Send error:', e)
    }
  } catch (e) {
    console.error('[push] Error:', e)
  }
}

/**
 * Send push to all staff in a branch
 */
export async function sendPushToBranch({
  branch_id,
  title,
  body,
  data,
  exclude_staff_id,
  roles,
}: {
  branch_id: string
  title: string
  body: string
  data?: Record<string, string>
  exclude_staff_id?: string
  roles?: string[]
}) {
  try {
    const where: any = { branch_id, is_active: true }
    if (exclude_staff_id) where.id = { not: exclude_staff_id }
    if (roles) where.role = { in: roles }

    const staff = await prisma.staff.findMany({ where, select: { id: true } })
    for (const s of staff) {
      await sendPushNotification({ staff_id: s.id, title, body, data })
    }
  } catch (e) {
    console.error('[push] Branch send error:', e)
  }
}

/**
 * Send to branch owner(s)
 */
export async function sendPushToOwner({
  tenant_id,
  title,
  body,
  data,
}: {
  tenant_id: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenant_id } })
    if (!tenant) return
    // Owner's staff record (is_owner_acting)
    const ownerStaff = await prisma.staff.findMany({
      where: { tenant_id, is_owner_acting: true, is_active: true },
      select: { id: true },
    })
    for (const s of ownerStaff) {
      await sendPushNotification({ staff_id: s.id, title, body, data })
    }
    // Also try tenant id directly (owner logged in as tenant)
    await sendPushNotification({ staff_id: tenant_id, title, body, data })
  } catch (e) {
    console.error('[push] Owner send error:', e)
  }
}

export const pushTemplates = {
  paymentReceived: (collectorName: string, amount: number, subscriberName: string) => ({
    title: '💳 دفعة جديدة',
    body: `${collectorName} جمع ${amount.toLocaleString()} د.ع من ${subscriberName}`,
  }),
  discountRequest: (collectorName: string, amount: number) => ({
    title: '🎁 طلب خصم',
    body: `${collectorName} يطلب خصم ${amount.toLocaleString()} د.ع`,
  }),
  discountApproved: (amount: number) => ({
    title: '✅ تم قبول الخصم',
    body: `تم الموافقة على خصم ${amount.toLocaleString()} د.ع`,
  }),
  discountRejected: () => ({
    title: '❌ تم رفض الخصم',
    body: 'تم رفض الخصم — أضيف للدين',
  }),
  walletReceived: (amount: number) => ({
    title: '💰 استلام من المحفظة',
    body: `استلم المدير ${amount.toLocaleString()} د.ع من محفظتك`,
  }),
  collectorCall: (subscriberName: string) => ({
    title: '📞 طلب زيارة',
    body: `${subscriberName} يطلب زيارة الجابي`,
  }),
  onlinePayment: (amount: number, subscriberName: string) => ({
    title: '💳 دفع إلكتروني',
    body: `${amount.toLocaleString()} د.ع من ${subscriberName}`,
  }),
  invoiceGenerated: (count: number, month: number) => ({
    title: '📄 إصدار فواتير',
    body: `تم إصدار ${count} فاتورة لشهر ${month}`,
  }),
  // Oil maintenance alerts
  oilDueSoon: (engineName: string, daysLeft: number) => ({
    title: '🛢️ تغيير دهن قريب',
    body: `المحرك ${engineName} يحتاج تغيير دهن خلال ${daysLeft} ${daysLeft <= 10 ? 'أيام' : 'يوم'}`,
  }),
  oilDueToday: (engineName: string) => ({
    title: '⚠️ تغيير دهن مستحق',
    body: `المحرك ${engineName} يحتاج تغيير دهن اليوم`,
  }),
  oilOverdue: (engineName: string, daysLate: number) => ({
    title: '🚨 تغيير دهن متأخر',
    body: `المحرك ${engineName} متأخر ${daysLate} يوم عن تغيير الدهن`,
  }),
  oilCritical: (engineName: string, daysLate: number) => ({
    title: '⛔ المحرك في خطر',
    body: `المحرك ${engineName} متأخر ${daysLate} يوم — قد يضرّ بالمحرك`,
  }),
  // Fuel alerts
  fuelLow: (generatorName: string, pct: number) => ({
    title: '⛽ وقود منخفض',
    body: `${generatorName}: ${Math.round(pct)}% — تعبئة عاجلة`,
  }),
  // Supplier debt reminder
  supplierDebtHigh: (supplierName: string, amount: number) => ({
    title: '💰 دين مورّد مرتفع',
    body: `${supplierName}: ${amount.toLocaleString()} د.ع مستحق`,
  }),
  // Expense added
  expenseAdded: (category: string, amount: number) => ({
    title: '💸 مصروف جديد',
    body: `${category}: ${amount.toLocaleString()} د.ع`,
  }),
  // App update available
  updateAvailable: (version: string, changelog?: string | null) => ({
    title: `⚡ تحديث ${version} متاح`,
    body: changelog && changelog.length > 0
      ? changelog.length > 140 ? `${changelog.substring(0, 137)}...` : changelog
      : 'اضغط هنا لتحميل أحدث إصدار من تطبيق أمبير',
  }),
}
