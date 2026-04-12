// GET /api/app-version
//
// Returns the minimum required app version and the latest available
// version. The Flutter app checks this on every launch and shows:
//   • "يجب التحديث" blocking screen if current < min_version
//   • "تحديث متاح" banner if current < latest_version
//
// No auth required — public endpoint so even expired sessions can
// check for updates.

import { NextResponse } from 'next/server'

// Update these values when you publish a new APK.
// min_version: users BELOW this are forced to update (breaking changes).
// latest_version: users BELOW this see a non-blocking "update available".
const APP_CONFIG = {
  min_version: '2.6.0',
  latest_version: '2.6.0',
  update_url: 'https://amper.iq/download', // or Play Store link
  changelog_ar: 'نظام الموردين + الكيوسك + الوقود والدهن + رصانة تسجيل الدخول',
}

export async function GET() {
  return NextResponse.json(APP_CONFIG)
}
