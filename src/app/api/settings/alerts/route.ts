import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      alerts_enabled: true,
      alert_phone: true,
      alert_provider: true,
      alert_api_key: true,
    },
  })

  return NextResponse.json({
    enabled: tenant?.alerts_enabled ?? false,
    phone: tenant?.alert_phone ?? '',
    provider: tenant?.alert_provider ?? 'callmebot',
    has_key: !!tenant?.alert_api_key,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const { enabled, phone, provider, api_key } = await req.json()

    const data: any = {}
    if (enabled !== undefined) data.alerts_enabled = enabled
    if (phone !== undefined) data.alert_phone = phone || null
    if (provider !== undefined) data.alert_provider = provider || null
    if (api_key !== undefined && api_key !== '') data.alert_api_key = api_key

    await prisma.tenant.update({
      where: { id: user.tenantId },
      data,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
