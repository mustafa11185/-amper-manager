import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushNotification, pushTemplates } from '@/lib/push'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'owner' && (session.user as any).role !== 'manager') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params

  try {
    const request = await prisma.collectorDiscountRequest.findUnique({
      where: { id },
      include: { subscriber: { select: { name: true } }, staff: { select: { name: true } } },
    })
    if (!request) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'الطلب معالج مسبقاً' }, { status: 400 })
    }

    const discountAmount = Number(request.amount)

    // Apply discount to invoice + mark request approved atomically
    const updated = await prisma.$transaction(async (tx) => {
      // 1) Find the target invoice: prefer request.invoice_id, else oldest unpaid
      let targetInv = request.invoice_id
        ? await tx.invoice.findUnique({ where: { id: request.invoice_id } })
        : null
      if (!targetInv) {
        targetInv = await tx.invoice.findFirst({
          where: { subscriber_id: request.subscriber_id, is_fully_paid: false },
          orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
        })
      }

      // 2) Apply discount to invoice
      if (targetInv && discountAmount > 0) {
        const baseAmt = Number(targetInv.base_amount)
        const currentDisc = Number(targetInv.discount_amount)
        const paid = Number(targetInv.amount_paid)
        const newDisc = currentDisc + discountAmount
        const newTotal = Math.max(0, baseAmt - newDisc)
        await tx.invoice.update({
          where: { id: targetInv.id },
          data: {
            discount_amount: newDisc,
            discount_type: 'fixed',
            discount_reason: request.reason || 'خصم من الجابي (بموافقة المدير)',
            total_amount_due: newTotal,
            is_fully_paid: paid >= newTotal,
          },
        })

        // 3) Audit log
        await tx.auditLog.create({
          data: {
            tenant_id: request.tenant_id,
            branch_id: request.branch_id,
            actor_id: (session.user as any).id ?? null,
            actor_type: (session.user as any).role,
            action: 'collector_discount_approved',
            entity_type: 'invoice',
            entity_id: targetInv.id,
            new_value: {
              discount_amount: discountAmount,
              new_total: newTotal,
              subscriber_name: request.subscriber.name,
              request_id: id,
            },
          },
        })
      }

      // 4) Mark request approved
      return tx.collectorDiscountRequest.update({
        where: { id },
        data: {
          status: 'approved',
          decided_by: (session.user as any).id || session.user.name,
          decided_at: new Date(),
        },
      })
    })

    // Notify the collector that the discount was approved
    await prisma.notification.create({
      data: {
        branch_id: request.branch_id,
        tenant_id: request.tenant_id,
        type: 'discount_approved',
        title: 'تمت الموافقة على الخصم ✅',
        body: `تمت الموافقة على خصم ${Number(request.amount).toLocaleString()} د.ع للمشترك ${request.subscriber.name}`,
        payload: { staff_id: request.staff_id, subscriber_id: request.subscriber_id, request_id: id },
      },
    })

    // Push notification
    const push = pushTemplates.discountApproved(Number(request.amount))
    sendPushNotification({ staff_id: request.staff_id, ...push }).catch(() => {})

    return NextResponse.json({ request: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
