import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  try {
    const announcements = await prisma.announcement.findMany({
      where: { tenant_id: user.tenantId },
      orderBy: { created_at: 'desc' },
      take: 20,
    })
    return NextResponse.json({ announcements })
  } catch (e: any) {
    console.error('[announcements/GET]', e)
    return NextResponse.json({ announcements: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { type, message, target, is_urgent } = await req.json()

  if (!message?.trim())
    return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })

  try {
    const announcement = await prisma.announcement.create({
      data: {
        tenant_id: user.tenantId,
        type: type ?? 'general',
        message: message.trim(),
        target: target ?? 'all',
        is_urgent: is_urgent ?? false,
        created_by: user.id,
      },
    })
    return NextResponse.json({ ok: true, announcement })
  } catch (e: any) {
    console.error('[announcements/POST]', e)
    return NextResponse.json(
      { error: e?.message || 'فشل حفظ الإشعار' },
      { status: 500 },
    )
  }
}
