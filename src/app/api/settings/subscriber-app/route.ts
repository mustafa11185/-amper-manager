import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const generator = await prisma.generator.findFirst({
    where: { branch: { tenant_id: user.tenantId } },
    include: { subscriber_app_settings: true },
  })

  const s = generator?.subscriber_app_settings
  return NextResponse.json({
    welcome_message: s?.welcome_message ?? '',
    primary_color: s?.primary_color ?? '#1B4FD8',
    furatpay_enabled: s?.furatpay_enabled ?? false,
    collector_call_enabled: s?.collector_call_enabled ?? true,
    show_debt: s?.show_debt ?? true,
    show_generator: s?.show_generator ?? true,
    show_invoices: s?.show_invoices ?? true,
    show_price: s?.show_price ?? false,
    show_collector: s?.show_collector ?? false,
    online_payment: s?.online_payment ?? true,
    partial_payment: s?.partial_payment ?? false,
    direct_contact: s?.direct_contact ?? false,
    notifications_enabled: s?.notifications_enabled ?? true,
    upsell_enabled: s?.upsell_enabled ?? true,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await req.json()

  const generator = await prisma.generator.findFirst({
    where: { branch: { tenant_id: user.tenantId } },
  })
  if (!generator) return NextResponse.json({ error: 'لا يوجد مولدة' }, { status: 404 })

  const data = {
    primary_color: body.primary_color || '#1B4FD8',
    welcome_message: body.welcome_message || null,
    is_active: true,
    show_debt: body.show_debt ?? true,
    show_generator: body.show_generator ?? true,
    show_invoices: body.show_invoices ?? true,
    show_price: body.show_price ?? false,
    show_collector: body.show_collector ?? false,
    online_payment: body.online_payment ?? true,
    partial_payment: body.partial_payment ?? false,
    collector_call_enabled: body.collector_call_enabled ?? true,
    direct_contact: body.direct_contact ?? false,
    notifications_enabled: body.notifications_enabled ?? true,
    upsell_enabled: body.upsell_enabled ?? true,
  }

  await prisma.subscriberAppSettings.upsert({
    where: { generator_id: generator.id },
    create: { generator_id: generator.id, tenant_id: user.tenantId, ...data },
    update: data,
  })

  return NextResponse.json({ ok: true })
}
