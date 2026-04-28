// Owner-triggered "test connection" probe for a configured gateway.
//
// Loads the tenant's saved credentials, instantiates the adapter, and calls
// gateway.testConnection() — which hits an auth-only endpoint per gateway
// (OAuth2 token / Basic-Auth probe). No transaction is created.
//
// Body: { gateway: 'zaincash' | 'qi' | 'asiapay' }
// Returns 200 { ok: true, message } on success, 400 { error } on auth/network
// failure (the message gives the owner enough to fix it).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGateway, type GatewayName } from '@/lib/payments'
import { prisma } from '@/lib/prisma'

const GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { tenantId?: string; role?: string } | undefined
  if (!user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { gateway?: string } | null
  const gateway = body?.gateway as GatewayName
  if (!gateway || !GATEWAYS.includes(gateway)) {
    return NextResponse.json({ error: 'بوابة غير صالحة' }, { status: 400 })
  }

  // We bypass getGateway()'s `is_enabled` check here — the owner often wants
  // to validate creds BEFORE enabling the gateway. So we read the row directly
  // and instantiate the adapter ourselves.
  const row = await prisma.paymentGatewayCredentials.findUnique({
    where: { tenant_id_gateway: { tenant_id: user.tenantId, gateway } },
    select: { is_test_mode: true },
  })
  if (!row) {
    return NextResponse.json({ error: 'لم تُسجَّل بيانات لهذه البوابة بعد' }, { status: 400 })
  }

  const adapter = await getGateway(user.tenantId, gateway)
  // getGateway returns null when is_enabled=false. Manually instantiate in
  // that case so the test still runs.
  let probe = adapter
  if (!probe) {
    // Re-load + decrypt creds and build the adapter directly.
    const { decryptCredentials } = await import('@/lib/payments/encryption')
    const { ZainCashGateway } = await import('@/lib/payments/zaincash')
    const { QiGateway } = await import('@/lib/payments/qi')
    const { AsiaPayGateway } = await import('@/lib/payments/asiapay')
    const full = await prisma.paymentGatewayCredentials.findUnique({
      where: { tenant_id_gateway: { tenant_id: user.tenantId, gateway } },
      select: { encrypted_credentials: true, is_test_mode: true },
    })
    if (!full) {
      return NextResponse.json({ error: 'بيانات غير موجودة' }, { status: 400 })
    }
    const creds = decryptCredentials<any>(full.encrypted_credentials)
    if (gateway === 'zaincash') probe = new ZainCashGateway(creds, full.is_test_mode)
    else if (gateway === 'qi') probe = new QiGateway(creds, full.is_test_mode)
    else if (gateway === 'asiapay') probe = new AsiaPayGateway(creds, full.is_test_mode)
  }

  if (!probe) return NextResponse.json({ error: 'تعذّر تحميل البوابة' }, { status: 500 })

  try {
    await probe.testConnection()
    // Mark last_validated_at so the UI can show "آخر اختبار ناجح".
    await prisma.paymentGatewayCredentials.update({
      where: { tenant_id_gateway: { tenant_id: user.tenantId, gateway } },
      data: { last_validated_at: new Date() },
    })
    return NextResponse.json({
      ok: true,
      message: row.is_test_mode ? 'الاتصال ناجح (وضع تجريبي)' : 'الاتصال ناجح ✓',
    })
  } catch (err: any) {
    console.warn(`[gateway-test/${gateway}] failed:`, err.message)
    return NextResponse.json({
      ok: false,
      error: `فشل الاتصال: ${err.message}`,
    }, { status: 400 })
  }
}
