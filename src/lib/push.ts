// ══════════════════════════════════════════════════════════════
//  Push Notification Sender
//
//  SETUP REQUIRED:
//  1. npm install firebase-admin
//  2. Create service account key in Firebase Console:
//     Project Settings → Service Accounts → Generate Key
//  3. Save as firebase-service-account.json in project root
//  4. Add to .env:
//     FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
//  5. Uncomment the Firebase initialization below
// ══════════════════════════════════════════════════════════════

import { prisma } from './prisma'

// ── Firebase Admin (uncomment when ready) ──
// import { initializeApp, cert, getApps } from 'firebase-admin/app'
// import { getMessaging } from 'firebase-admin/messaging'
//
// if (getApps().length === 0 && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
//   const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
//   initializeApp({ credential: cert(serviceAccount) })
// }

/**
 * Send push notification to a staff member
 * Falls back gracefully if Firebase is not configured
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
    // Get active device tokens for this staff
    const devices = await prisma.staffDevice.findMany({
      where: { staff_id, is_active: true },
    })

    if (!devices.length) {
      console.log(`[push] No devices for staff ${staff_id}`)
      return
    }

    const tokens = devices.map(d => d.fcm_token)

    // ── Firebase push (uncomment when configured) ──
    // try {
    //   const messaging = getMessaging()
    //   const result = await messaging.sendEachForMulticast({
    //     tokens,
    //     notification: { title, body },
    //     data: data ?? {},
    //     android: {
    //       priority: 'high',
    //       notification: { sound: 'default' },
    //     },
    //   })
    //
    //   // Clean up invalid tokens
    //   result.responses.forEach((resp, idx) => {
    //     if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
    //       prisma.staffDevice.updateMany({
    //         where: { fcm_token: tokens[idx] },
    //         data: { is_active: false },
    //       }).catch(() => {})
    //     }
    //   })
    //
    //   console.log(`[push] Sent to ${result.successCount}/${tokens.length} devices for staff ${staff_id}`)
    // } catch (e) {
    //   console.error('[push] Firebase error:', e)
    // }

    console.log(`[push] Would send to ${tokens.length} devices: "${title}" — ${body}`)
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
}: {
  branch_id: string
  title: string
  body: string
  data?: Record<string, string>
  exclude_staff_id?: string
}) {
  try {
    const staff = await prisma.staff.findMany({
      where: {
        branch_id,
        is_active: true,
        ...(exclude_staff_id ? { id: { not: exclude_staff_id } } : {}),
      },
      select: { id: true },
    })

    for (const s of staff) {
      await sendPushNotification({ staff_id: s.id, title, body, data })
    }
  } catch (e) {
    console.error('[push] Branch send error:', e)
  }
}

/**
 * Notification type helpers
 */
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
}
