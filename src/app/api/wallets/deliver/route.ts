import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushNotification, pushTemplates } from '@/lib/push'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const { staff_id, amount, notes } = await req.json()

    if (!staff_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const wallet = await prisma.collectorWallet.findUnique({
      where: { staff_id },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 })
    }

    const deliverAmount = Math.min(amount, Number(wallet.balance))

    if (deliverAmount <= 0) {
      return NextResponse.json({ error: 'الرصيد غير كافٍ' }, { status: 400 })
    }

    // Transaction: update wallet + create delivery record
    const [updatedWallet] = await prisma.$transaction([
      prisma.collectorWallet.update({
        where: { staff_id },
        data: {
          balance: { decrement: deliverAmount },
          total_delivered: { increment: deliverAmount },
          last_updated: new Date(),
        },
      }),
      prisma.deliveryRecord.create({
        data: {
          branch_id: wallet.branch_id,
          from_staff_id: staff_id,
          to_staff_id: user.id,
          tenant_id: wallet.tenant_id,
          received_by_owner: user.role === 'owner',
          amount: deliverAmount,
          payment_type: 'cash',
          notes: notes || null,
          is_confirmed: true,
          confirmed_at: new Date(),
          confirmed_by: user.id,
        },
      }),
    ])

    // Create notification for collector
    try {
      await prisma.notification.create({
        data: {
          branch_id: wallet.branch_id,
          tenant_id: wallet.tenant_id || '',
          type: 'wallet_delivery',
          title: 'تم استلام مبلغ',
          body: `تم استلام ${deliverAmount.toLocaleString()} د.ع من محفظتك`,
        },
      })
      // Push notification
      const push = pushTemplates.walletReceived(deliverAmount)
      sendPushNotification({ staff_id, ...push }).catch(() => {})
    } catch (_) {
      // notification is best-effort
    }

    return NextResponse.json({
      ok: true,
      new_balance: Number(updatedWallet.balance),
      delivered: deliverAmount,
    })
  } catch (e: any) {
    console.error('[wallets/deliver]', e)
    return NextResponse.json({ error: e.message || 'خطأ' }, { status: 500 })
  }
}
