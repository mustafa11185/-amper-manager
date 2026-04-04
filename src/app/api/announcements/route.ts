import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const announcements = await prisma.$queryRaw`
    SELECT * FROM announcements
    WHERE tenant_id = ${user.tenantId}
    ORDER BY created_at DESC
    LIMIT 20
  ` as any[]

  return NextResponse.json({ announcements })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { type, message, target, is_urgent } = await req.json()

  if (!message?.trim())
    return NextResponse.json({ error: 'الرسالة مطلوبة' }, { status: 400 })

  const result = await prisma.$queryRaw`
    INSERT INTO announcements (tenant_id, type, message, target, is_urgent, created_by)
    VALUES (
      ${user.tenantId},
      ${type ?? 'general'},
      ${message.trim()},
      ${target ?? 'all'},
      ${is_urgent ?? false},
      ${user.id}
    )
    RETURNING *
  ` as any[]

  return NextResponse.json({ ok: true, announcement: result[0] })
}
