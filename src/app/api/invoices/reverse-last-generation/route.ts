import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { branch_id } = await req.json()
    const tenantId = user.tenantId as string

    if (!branch_id) {
      return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
    }

    // Find last non-reversed generation log
    const lastLog = await prisma.invoiceGenerationLog.findFirst({
      where: { branch_id, tenant_id: tenantId, is_reversed: false },
      orderBy: { generated_at: 'desc' },
    })

    if (!lastLog) {
      return NextResponse.json({ error: 'لا يوجد إصدار سابق للتراجع عنه' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Find invoices created in this generation batch
      // Match by branch, billing period, and created_at close to generated_at
      const genTime = new Date(lastLog.generated_at)
      const windowStart = new Date(genTime.getTime() - 60000) // 1 min before
      const windowEnd = new Date(genTime.getTime() + 300000)  // 5 min after

      const invoicesToDelete = await tx.invoice.findMany({
        where: {
          branch_id,
          billing_month: lastLog.billing_month,
          billing_year: lastLog.billing_year,
          created_at: { gte: windowStart, lte: windowEnd },
          amount_paid: 0,
          is_fully_paid: false,
        },
        select: { id: true },
      })

      // Delete the invoices
      if (invoicesToDelete.length > 0) {
        await tx.invoice.deleteMany({
          where: { id: { in: invoicesToDelete.map(i => i.id) } },
        })
      }

      // Restore debt: find invoices that were rolled to debt in the same window
      const rolledInvoices = await tx.invoice.findMany({
        where: {
          branch_id,
          payment_method: 'rolled_to_debt',
          updated_at: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, subscriber_id: true, total_amount_due: true, amount_paid: true },
      })

      // Reverse the debt additions
      const debtBySubscriber = new Map<string, number>()
      for (const inv of rolledInvoices) {
        const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
        if (remaining > 0) {
          debtBySubscriber.set(inv.subscriber_id, (debtBySubscriber.get(inv.subscriber_id) || 0) + remaining)
        }
      }

      for (const [subId, debtAmount] of debtBySubscriber) {
        await tx.subscriber.update({
          where: { id: subId },
          data: { total_debt: { decrement: debtAmount } },
        })
      }

      // Restore rolled invoices back to unpaid
      if (rolledInvoices.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: rolledInvoices.map(i => i.id) } },
          data: { is_fully_paid: false, payment_method: null },
        })
      }

      // Mark generation log as reversed
      await tx.invoiceGenerationLog.update({
        where: { id: lastLog.id },
        data: { is_reversed: true, reversed_at: new Date() },
      })
    })

    return NextResponse.json({
      ok: true,
      reversed_generation_id: lastLog.id,
      message: 'تم التراجع عن آخر إصدار بنجاح',
    })
  } catch (err: any) {
    console.error('Reverse generation error:', err)
    return NextResponse.json({ error: err.message || 'خطأ في التراجع' }, { status: 500 })
  }
}
