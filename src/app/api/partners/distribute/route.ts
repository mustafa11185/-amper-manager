import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppAlert } from '@/lib/whatsapp-send'

// POST /api/partners/distribute
// Body: { month, year, scope_type, scope_id, lines: [{partner_id, amount}, ...], notes }
// Persists a finalized distribution + creates withdrawal records for each partner.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه توزيع الأرباح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  try {
    const {
      month, year, scope_type, scope_id,
      revenue, total_costs, net_profit,
      lines, notes,
    } = await req.json()

    if (!month || !year || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    // Prevent duplicate distribution for same period+scope
    const existing = await prisma.profitDistribution.findFirst({
      where: {
        tenant_id: tenantId,
        period_month: month,
        period_year: year,
        scope_type: scope_type ?? 'tenant',
        scope_id: scope_id ?? null,
      },
    })
    if (existing) {
      return NextResponse.json(
        { error: `يوجد توزيع سابق لنفس الفترة (${month}/${year})` },
        { status: 409 }
      )
    }

    // Create distribution + withdrawals atomically
    const result = await prisma.$transaction(async (tx) => {
      const distribution = await tx.profitDistribution.create({
        data: {
          tenant_id: tenantId,
          scope_type: scope_type ?? 'tenant',
          scope_id: scope_id ?? null,
          period_month: month,
          period_year: year,
          total_revenue: Number(revenue ?? 0),
          total_costs: Number(total_costs ?? 0),
          net_profit: Number(net_profit ?? 0),
          is_finalized: true,
          finalized_at: new Date(),
          notes: notes || null,
        },
      })

      // Create one withdrawal per partner line
      for (const line of lines) {
        if (Number(line.amount) <= 0) continue
        await tx.partnerWithdrawal.create({
          data: {
            tenant_id: tenantId,
            partner_id: line.partner_id,
            amount: Number(line.amount),
            type: 'profit_distribution',
            distribution_id: distribution.id,
            period_month: month,
            period_year: year,
            description: `توزيع أرباح ${month}/${year}`,
          },
        })
      }

      return distribution
    })

    // ── Send WhatsApp notifications to partners (best effort) ──
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, alerts_enabled: true, alert_provider: true, alert_api_key: true },
    })

    let waSent = 0
    if (tenant?.alerts_enabled && tenant.alert_provider && tenant.alert_api_key) {
      for (const line of lines) {
        if (Number(line.amount) <= 0) continue
        // Find partner phone
        const partner = await prisma.partner.findUnique({
          where: { id: line.partner_id },
          select: { phone: true, name: true },
        })
        if (partner?.phone) {
          const msg = `💰 توزيع أرباح من ${tenant.name}\n\n` +
            `عزيزي ${partner.name},\n` +
            `حصتك من أرباح ${month}/${year}:\n\n` +
            `*${Number(line.amount).toLocaleString('ar-IQ')} د.ع*\n\n` +
            `النسبة: ${line.percentage}%\n` +
            `صافي الربح: ${Number(net_profit).toLocaleString('ar-IQ')} د.ع`
          const sent = await sendWhatsAppAlert({
            phone: partner.phone,
            message: msg,
            provider: tenant.alert_provider as any,
            apiKey: tenant.alert_api_key,
          })
          if (sent) waSent++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      distribution_id: result.id,
      whatsapp_sent: waSent,
    })
  } catch (err: any) {
    console.error('[partners/distribute]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — list past distributions
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const distributions = await prisma.profitDistribution.findMany({
    where: { tenant_id: tenantId },
    include: {
      withdrawals: {
        include: { partner: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    take: 24,
  })

  return NextResponse.json({ distributions })
}
