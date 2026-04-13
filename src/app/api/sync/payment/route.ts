import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const { payments } = await req.json()

    if (!Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: 'لا توجد دفعات' }, { status: 400 })
    }

    const results = []

    for (const payment of payments) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const subscriber = await tx.subscriber.findUnique({
            where: { id: payment.subscriber_id },
          })
          if (!subscriber) throw new Error('subscriber not found')

          const unpaidInvoices = await tx.invoice.findMany({
            where: { subscriber_id: payment.subscriber_id, is_fully_paid: false },
            orderBy: [{ billing_year: 'asc' }, { billing_month: 'asc' }],
          })

          let remaining = payment.amount
          for (const inv of unpaidInvoices) {
            if (remaining <= 0) break
            const due = Number(inv.total_amount_due) - Number(inv.amount_paid)
            const pay = Math.min(remaining, due)
            await tx.invoice.update({
              where: { id: inv.id },
              data: {
                amount_paid: { increment: pay },
                is_fully_paid: pay >= due,
                payment_method: payment.payment_method,
                collector_id: user.role !== 'owner' ? user.id : null,
              },
            })
            remaining -= pay
          }

          // Only the LEFTOVER amount (after paying unpaid invoices)
          // reduces total_debt. The old code subtracted the full
          // payment.amount, which double-counted anything already
          // applied to invoices and silently erased debt on pure
          // invoice payments.
          if (remaining > 0) {
            const currentDebt = Number(subscriber.total_debt)
            const debtCollected = Math.min(remaining, currentDebt)
            const newDebt = Math.max(0, currentDebt - remaining)
            await tx.subscriber.update({
              where: { id: payment.subscriber_id },
              data: { total_debt: newDebt },
            })
            if (debtCollected > 0) {
              // Mirror the pos/payment audit row so debt
              // collections via offline sync also show up in
              // the financial report's total_collected.
              await tx.auditLog.create({
                data: {
                  tenant_id: subscriber.tenant_id,
                  branch_id: subscriber.branch_id,
                  actor_id: user.id ?? null,
                  actor_type: user.role ?? null,
                  action: 'debt_collected',
                  entity_type: 'subscriber',
                  entity_id: payment.subscriber_id,
                  new_value: {
                    amount: debtCollected,
                    payment_method: payment.payment_method,
                    source: 'offline_sync',
                  },
                },
              })
            }
          }

          if (payment.payment_method === 'cash' && user.role !== 'owner') {
            await tx.collectorWallet.upsert({
              where: { staff_id: user.id },
              create: {
                staff_id: user.id,
                branch_id: user.branchId || subscriber.branch_id,
                tenant_id: subscriber.tenant_id,
                total_collected: payment.amount,
                balance: payment.amount,
              },
              update: {
                total_collected: { increment: payment.amount },
                balance: { increment: payment.amount },
                last_updated: new Date(),
              },
            })
          }

          return { subscriber_id: payment.subscriber_id, status: 'synced' }
        })
        results.push(result)
      } catch {
        results.push({ subscriber_id: payment.subscriber_id, status: 'failed' })
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
