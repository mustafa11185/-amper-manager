import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppAlert } from '@/lib/whatsapp-send'

// Owner-only: manually add a previous/legacy debt to a subscriber.
// Bumps subscriber.total_debt and records an AuditLog entry so the
// addition is traceable. Notifies the subscriber via WhatsApp when
// the tenant has a configured provider.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = session.user as any
    if (user.role !== 'owner') return NextResponse.json({ error: 'المالك فقط' }, { status: 403 })

    const { id } = await params
    const { amount, reason } = await req.json()

    const debtAmount = Number(amount)
    if (!debtAmount || debtAmount <= 0 || !Number.isFinite(debtAmount)) {
      return NextResponse.json({ error: 'مبلغ الدين مطلوب ويجب أن يكون أكبر من صفر' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findFirst({
      where: { id, tenant_id: user.tenantId },
    })
    if (!subscriber) return NextResponse.json({ error: 'المشترك غير موجود' }, { status: 404 })

    const newTotal = Number(subscriber.total_debt) + debtAmount

    await prisma.$transaction(async (tx) => {
      await tx.subscriber.update({
        where: { id },
        data: { total_debt: newTotal },
      })
      await tx.auditLog.create({
        data: {
          tenant_id: subscriber.tenant_id,
          branch_id: subscriber.branch_id,
          actor_id: user.id ?? null,
          actor_type: 'owner',
          action: 'manual_debt_added',
          entity_type: 'subscriber',
          entity_id: id,
          new_value: {
            amount: debtAmount,
            reason: reason || null,
            previous_total: Number(subscriber.total_debt),
            new_total: newTotal,
          },
        },
      })
    })

    // Best-effort WhatsApp to the subscriber. Non-blocking on failure
    // — the debt is already saved, the alert is just a courtesy ping.
    const phone = subscriber.whatsapp || subscriber.phone
    if (phone) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: subscriber.tenant_id },
        select: { alerts_enabled: true, alert_provider: true, alert_api_key: true },
      })
      if (tenant?.alerts_enabled && tenant.alert_provider && tenant.alert_api_key) {
        const fmt = (n: number) => n.toLocaleString('en')
        const lines = [
          '📌 إشعار من إدارة المولدة',
          '',
          `تم إضافة دين سابق على حسابك بمبلغ:`,
          `*${fmt(debtAmount)} د.ع*`,
          '',
          `إجمالي الدين الحالي: ${fmt(newTotal)} د.ع`,
        ]
        if (reason) lines.push('', `السبب: ${reason}`)
        lines.push('', 'الرجاء التواصل مع إدارة المولدة للتفاصيل.')
        // Fire-and-forget: don't block the response on the network call.
        sendWhatsAppAlert({
          phone,
          message: lines.join('\n'),
          provider: tenant.alert_provider as any,
          apiKey: tenant.alert_api_key,
        }).catch((e) => console.error('[debt/add] whatsapp send failed:', e))
      }
    }

    return NextResponse.json({
      ok: true,
      message: `تم إضافة دين بمبلغ ${debtAmount.toLocaleString('en')} د.ع`,
      new_total_debt: newTotal,
    })
  } catch (error) {
    console.error('[debt/add] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
