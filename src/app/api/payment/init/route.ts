import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPayment } from '@/lib/payment-service'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { subscriber_id, invoice_id, amount, payment_method } = await req.json()
    if (!subscriber_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriber_id },
      include: { branch: true },
    })
    if (!subscriber) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    const branch = subscriber.branch

    // ZainCash — manual flow, no gateway needed
    if (payment_method === 'zaincash') {
      await prisma.onlinePayment.create({
        data: {
          subscriber_id, tenant_id: subscriber.tenant_id,
          invoice_id: invoice_id || null, amount,
          gateway: 'zaincash', gateway_ref: `ZC-${Date.now()}`, status: 'pending',
        },
      })
      return NextResponse.json({
        zaincash: true, payment_url: null,
        merchant_phone: (branch as any).zaincash_phone ?? '',
        amount,
      })
    }

    if (!branch.is_online_payment_enabled || branch.active_gateway === 'none') {
      return NextResponse.json({ error: 'لم يتم إعداد الدفع الإلكتروني' }, { status: 400 })
    }

    const billingMonth = new Date().getMonth() + 1

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3002'

    const result = await createPayment(branch as any, {
      invoice_id: invoice_id || null,
      subscriber_id,
      subscriber_name: subscriber.name,
      subscriber_phone: subscriber.phone || '',
      amount,
      billing_month: billingMonth,
      return_url: `${baseUrl}/payment/success?invoice=${invoice_id || ''}&subscriber=${subscriber_id}`,
      callback_url: `${baseUrl}/api/payment/${branch.active_gateway === 'aps' ? 'aps-callback' : 'furatpay-callback'}`,
    })

    await prisma.onlinePayment.create({
      data: {
        subscriber_id,
        tenant_id: subscriber.tenant_id,
        invoice_id: invoice_id || null,
        amount,
        gateway: result.gateway,
        gateway_ref: result.order_id,
        status: 'pending',
      },
    })

    return NextResponse.json({ payment_url: result.payment_url, order_id: result.order_id, gateway: result.gateway })
  } catch (err: any) {
    console.error('[payment/init] Error:', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
