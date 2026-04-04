import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const branch = await prisma.branch.findFirst({
    where: { tenant_id: user.tenantId, is_active: true },
    select: {
      furatpay_merchant_id: true,
      furatpay_api_key: true,
      furatpay_secret_key: true,
      furatpay_is_sandbox: true,
      is_online_payment_enabled: true,
      aps_merchant_id: true,
      aps_access_code: true,
      aps_sha_request_phrase: true,
      aps_sha_response_phrase: true,
      aps_is_sandbox: true,
      aps_enabled: true,
      active_gateway: true,
      zaincash_phone: true,
    },
  })

  if (!branch) return NextResponse.json({ error: 'لا يوجد فرع' }, { status: 404 })

  return NextResponse.json({
    furatpay_merchant_id: branch.furatpay_merchant_id ?? '',
    furatpay_api_key: branch.furatpay_api_key ? '••••••••' : '',
    furatpay_api_key_set: !!branch.furatpay_api_key,
    furatpay_secret_key: branch.furatpay_secret_key ? '••••••••' : '',
    furatpay_secret_key_set: !!branch.furatpay_secret_key,
    furatpay_is_sandbox: branch.furatpay_is_sandbox,
    furatpay_enabled: !!(branch.active_gateway === 'furatpay'),
    is_online_payment_enabled: branch.is_online_payment_enabled,
    aps_merchant_id: branch.aps_merchant_id ?? '',
    aps_access_code: branch.aps_access_code ? '••••••••' : '',
    aps_access_code_set: !!branch.aps_access_code,
    aps_sha_request_phrase: branch.aps_sha_request_phrase ? '••••••••' : '',
    aps_sha_request_phrase_set: !!branch.aps_sha_request_phrase,
    aps_sha_response_phrase: branch.aps_sha_response_phrase ? '••••••••' : '',
    aps_sha_response_phrase_set: !!branch.aps_sha_response_phrase,
    aps_is_sandbox: branch.aps_is_sandbox,
    aps_enabled: branch.aps_enabled,
    active_gateway: branch.active_gateway,
    zaincash_phone: (branch as any).zaincash_phone ?? '',
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const body = await req.json()
    const {
      furatpay_merchant_id, furatpay_api_key, furatpay_secret_key, furatpay_is_sandbox,
      aps_merchant_id, aps_access_code, aps_sha_request_phrase, aps_sha_response_phrase, aps_is_sandbox,
      active_gateway,
      zaincash_phone,
    } = body

    const branch = await prisma.branch.findFirst({
      where: { tenant_id: user.tenantId, is_active: true },
    })
    if (!branch) return NextResponse.json({ error: 'لا يوجد فرع' }, { status: 404 })

    const gateway = active_gateway || 'none'

    const data: any = {
      furatpay_merchant_id: furatpay_merchant_id || null,
      furatpay_is_sandbox: furatpay_is_sandbox ?? true,
      aps_merchant_id: aps_merchant_id || null,
      aps_is_sandbox: aps_is_sandbox ?? true,
      active_gateway: gateway,
      is_online_payment_enabled: gateway !== 'none',
      zaincash_phone: zaincash_phone || null,
    }

    // Set aps_enabled based on active_gateway
    if (gateway === 'aps') {
      data.aps_enabled = true
    } else if (gateway === 'furatpay') {
      data.aps_enabled = false
    } else {
      data.aps_enabled = false
    }

    // Only update api_key if it's not the masked placeholder
    if (furatpay_api_key && furatpay_api_key !== '••••••••') {
      data.furatpay_api_key = furatpay_api_key
    }
    // Only update secret_key if it's not the masked placeholder
    if (furatpay_secret_key && furatpay_secret_key !== '••••••••') {
      data.furatpay_secret_key = furatpay_secret_key
    }
    // Only update APS secrets if not masked
    if (aps_access_code && aps_access_code !== '••••••••') {
      data.aps_access_code = aps_access_code
    }
    if (aps_sha_request_phrase && aps_sha_request_phrase !== '••••••••') {
      data.aps_sha_request_phrase = aps_sha_request_phrase
    }
    if (aps_sha_response_phrase && aps_sha_response_phrase !== '••••••••') {
      data.aps_sha_response_phrase = aps_sha_response_phrase
    }

    await prisma.branch.update({
      where: { id: branch.id },
      data,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
