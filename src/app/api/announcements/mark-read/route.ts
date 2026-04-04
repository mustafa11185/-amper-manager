import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const subscriberId = cookieStore.get('subscriber_id')?.value
    if (!subscriberId) return NextResponse.json({ ok: false })

    const { announcement_ids } = await req.json()
    if (!announcement_ids?.length) return NextResponse.json({ ok: true })

    for (const id of announcement_ids) {
      await prisma.$executeRaw`
        INSERT INTO subscriber_reads (subscriber_id, announcement_id)
        VALUES (${subscriberId}, ${String(id)})
        ON CONFLICT (subscriber_id, announcement_id) DO NOTHING
      `
    }
    return NextResponse.json({ ok: true })
  } catch (_e) {
    return NextResponse.json({ ok: false })
  }
}
