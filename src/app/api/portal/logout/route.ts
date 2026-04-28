// POST /api/logout
//
// Clears the subscriber_id cookie and localStorage code.
// Returns a redirect instruction so the client goes to /.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('subscriber_id')
  return NextResponse.json({ ok: true })
}
