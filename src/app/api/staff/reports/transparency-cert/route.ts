import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Transparency certificate — proves all transactions for staff (collector self-defense)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const staffId = user.id as string

  const now = new Date()
  const month = parseInt(req.nextUrl.searchParams.get('month') ?? String(now.getMonth() + 1))
  const year = parseInt(req.nextUrl.searchParams.get('year') ?? String(now.getFullYear()))
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)

  // All payments collected by this staff in the period
  const invoices = await prisma.invoice.findMany({
    where: {
      collector_id: staffId,
      updated_at: { gte: periodStart, lte: periodEnd },
    },
    include: { subscriber: { select: { name: true, serial_number: true } } },
    orderBy: { updated_at: 'desc' },
  })

  const totalCollected = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
  const cashTotal = invoices
    .filter(i => i.payment_method !== 'card')
    .reduce((s, i) => s + Number(i.amount_paid), 0)
  const cardTotal = invoices
    .filter(i => i.payment_method === 'card')
    .reduce((s, i) => s + Number(i.amount_paid), 0)

  // Deliveries to manager
  const deliveries = await prisma.deliveryRecord.findMany({
    where: {
      from_staff_id: staffId,
      delivered_at: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { delivered_at: 'desc' },
  })
  const totalDelivered = deliveries.reduce((s, d) => s + Number(d.amount), 0)

  // Daily reports
  const dailyReports = await prisma.collectorDailyReport.findMany({
    where: {
      staff_id: staffId,
      report_date: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { report_date: 'desc' },
  })

  return NextResponse.json({
    period: { month, year },
    summary: {
      total_collected: totalCollected,
      cash_total: cashTotal,
      card_total: cardTotal,
      total_delivered: totalDelivered,
      pending_balance: totalCollected - totalDelivered,
      payment_count: invoices.length,
      delivery_count: deliveries.length,
    },
    payments: invoices.map(i => ({
      id: i.id,
      subscriber_name: i.subscriber?.name,
      serial: i.subscriber?.serial_number,
      amount: Number(i.amount_paid),
      method: i.payment_method,
      date: i.updated_at,
    })),
    deliveries: deliveries.map(d => ({
      id: d.id,
      amount: Number(d.amount),
      payment_type: d.payment_type,
      is_confirmed: d.is_confirmed,
      delivered_at: d.delivered_at,
    })),
    daily_reports: dailyReports.length,
  })
}
