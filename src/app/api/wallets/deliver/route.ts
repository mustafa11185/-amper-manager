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
    const { staff_id, amount, notes, deduct_salary, salary_amount } = await req.json()

    if (!staff_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const wallet = await prisma.collectorWallet.findUnique({
      where: { staff_id },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 })
    }

    // Tenant validation
    if (wallet.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const deliverAmount = Math.min(amount, Number(wallet.balance))

    if (deliverAmount <= 0) {
      return NextResponse.json({ error: 'الرصيد غير كافٍ' }, { status: 400 })
    }

    // Salary can exceed the wallet's available amount — the manager is
    // free to top up from their own pocket. Split it:
    //   walletSalaryPart  = the slice of salary that comes out of the wallet
    //   pocketSalaryPart  = the slice the manager pays from their own money
    //   netToManager      = what the manager actually keeps from this delivery
    const totalSalary = deduct_salary && salary_amount > 0 ? Number(salary_amount) : 0
    const walletSalaryPart = Math.min(totalSalary, deliverAmount)
    const pocketSalaryPart = Math.max(0, totalSalary - deliverAmount)
    const netToManager = deliverAmount - walletSalaryPart

    // Transaction: update wallet + create delivery record + optional salary payment
    const [updatedWallet, delivery] = await prisma.$transaction([
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

    // Create a single salary-payment record for the FULL amount paid to
    // the staff (wallet portion + manager's out-of-pocket top-up). The
    // `paid_from_delivery` flag still applies because the payment event
    // is anchored to this delivery.
    if (totalSalary > 0) {
      try {
        const now = new Date()
        const noteParts: string[] = []
        if (walletSalaryPart > 0) noteParts.push(`من المحفظة: ${walletSalaryPart.toLocaleString()} د.ع`)
        if (pocketSalaryPart > 0) noteParts.push(`من المدير: ${pocketSalaryPart.toLocaleString()} د.ع`)
        await prisma.salaryPayment.create({
          data: {
            staff_id,
            tenant_id: wallet.tenant_id,
            branch_id: wallet.branch_id,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            amount: totalSalary,
            payment_type: 'salary',
            paid_from_delivery: true,
            delivery_id: delivery.id,
            notes: noteParts.join(' · '),
          },
        })
      } catch (salaryErr: any) {
        console.log('Salary payment record failed (non-critical):', salaryErr.message)
      }
    }

    // Notification — get staff name
    try {
      const staffRecord = await prisma.staff.findUnique({ where: { id: staff_id }, select: { name: true } })
      const staffName = staffRecord?.name || 'الموظف'
      await prisma.notification.create({
        data: {
          branch_id: wallet.branch_id,
          tenant_id: wallet.tenant_id,
          type: 'wallet_delivery',
          title: 'استلام من محفظة 💰',
          body: `تم استلام ${deliverAmount.toLocaleString()} د.ع من محفظة ${staffName}`,
          payload: { staff_id, staff_name: staffName, amount: deliverAmount, salary_deducted: totalSalary },
        },
      })
      const push = pushTemplates.walletReceived(deliverAmount)
      sendPushNotification({ staff_id, ...push }).catch(() => {})
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      new_balance: Number(updatedWallet.balance),
      delivered: deliverAmount,
      salary_total: totalSalary,
      salary_from_wallet: walletSalaryPart,
      salary_from_pocket: pocketSalaryPart,
      net_to_manager: netToManager,
    })
  } catch (e: any) {
    console.error('[wallets/deliver]', e)
    return NextResponse.json({ error: e.message || 'خطأ' }, { status: 500 })
  }
}
