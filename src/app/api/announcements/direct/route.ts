import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const tenantId = (session?.user as any)?.tenantId as string | undefined
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subscriber_id, message, type } = await req.json()
  if (!subscriber_id || !message?.trim())
    return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

  const result = await prisma.$queryRaw`
    INSERT INTO announcements (
      tenant_id, type, message, target, subscriber_id, auto_generated
    ) VALUES (
      ${tenantId},
      ${type ?? 'general'},
      ${message.trim()},
      'specific',
      ${subscriber_id},
      false
    )
    RETURNING id, message, target
  ` as any[]

  return NextResponse.json({ ok: true, announcement: result[0] })
}
