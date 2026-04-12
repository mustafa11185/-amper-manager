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
// When you publish a new version:
//   1. flutter build apk --release
//   2. gh release create vX.Y.Z ~/Desktop/Amper-vX.Y.Z.apk --repo mustafa11185/amper-flutter
//   3. Update min_version / latest_version / update_url below
//   4. git push → Render deploys → users see "تحديث متاح"
const APP_CONFIG = {
  min_version: '2.6.0',
  latest_version: '2.7.0',
  update_url: 'https://github.com/mustafa11185/amper-flutter/releases/latest/download/Amper-v2.7.0.apk',
  changelog_ar: 'فحص شامل + إصلاحات حرجة + تحسينات الأداء والواجهة',
}

export async function GET() {
  return NextResponse.json(APP_CONFIG)
}
