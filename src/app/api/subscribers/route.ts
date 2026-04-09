import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateAccessCode, generatePrivacyCode } from '@/lib/access-code'
import { getActiveBillingPeriod, getActiveBillingPeriodByTenant } from '@/lib/billing-period'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const url = req.nextUrl.searchParams
  const page = parseInt(url.get('page') || '1')
  const limit = parseInt(url.get('limit') || '20')
  const search = url.get('search') || ''
  const type = url.get('type') || ''        // gold | normal
  const status = url.get('status') || ''    // active | debt | inactive | unpaid
  const governorate = url.get('governorate') || ''
  const alley = url.get('alley') || ''
  const alleyId = url.get('alley_id') || ''
  const sort = url.get('sort') || ''        // debt_desc

  const where: any = {
    tenant_id: tenantId,
    // Staff can only see subscribers in their own branch
    ...(user.role !== 'owner' && branchId ? { branch_id: branchId } : {}),
  }

  // Owner can filter by branch_id query param
  const qBranch = url.get('branch_id')
  if (qBranch) where.branch_id = qBranch

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { serial_number: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { meter_number: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (type === 'gold') where.subscription_type = 'gold'
  else if (type === 'normal') where.subscription_type = 'normal'

  if (status === 'active') { where.is_active = true }
  else if (status === 'inactive') { where.is_active = false }
  else if (status === 'debt') { where.is_active = true; where.total_debt = { gt: 0 } }
  else { where.is_active = true }

  if (governorate) where.governorate = governorate
  if (alley) where.alley = alley
  if (alleyId) where.alley_id = alleyId

  // Special handling for 'unpaid' — subscribers who have an unpaid invoice OR have debt
  if (status === 'unpaid') {
    delete where.total_debt
    where.is_active = true

    // Use current month for unpaid filter (not pricing effective_from)
    const bMonth = new Date().getMonth() + 1
    const bYear = new Date().getFullYear()

    // Find subscribers who have an UNPAID invoice for this billing period
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        billing_month: bMonth,
        billing_year: bYear,
        is_fully_paid: false,
      },
      select: { subscriber_id: true },
      distinct: ['subscriber_id'],
    })
    const unpaidIds = unpaidInvoices.map(i => i.subscriber_id)

    // Find subscribers with accumulated debt
    const debtors = await prisma.subscriber.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        total_debt: { gt: 0 },
      },
      select: { id: true },
    })
    const debtorIds = debtors.map(d => d.id)

    // Combine: unpaid invoice OR has debt (deduplicate)
    const allUnpaidIds = [...new Set([...unpaidIds, ...debtorIds])]
    if (allUnpaidIds.length > 0) {
      where.id = { in: allUnpaidIds }
    } else {
      // No one unpaid — return empty
      where.id = { in: [] }
    }
  }

  const orderBy = sort === 'debt_desc'
    ? { total_debt: 'desc' as const }
    : { created_at: 'desc' as const }

  // Get billing month from last invoice generation log (fallback: current month)
  const bp = branchId
    ? await getActiveBillingPeriod(branchId)
    : await getActiveBillingPeriodByTenant(tenantId)
  const currentBMonth = bp.month
  const currentBYear = bp.year

  const [subscribers, total] = await Promise.all([
    prisma.subscriber.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        serial_number: true,
        name: true,
        phone: true,
        meter_number: true,
        access_code: true,
        subscription_type: true,
        amperage: true,
        total_debt: true,
        is_active: true,
        governorate: true,
        alley: true,
        alley_id: true,
        needs_attention: true,
        created_at: true,
        invoices: {
          where: { billing_month: currentBMonth, billing_year: currentBYear },
          take: 1,
          select: {
            id: true,
            invoice_number: true,
            billing_month: true,
            billing_year: true,
            total_amount_due: true,
            amount_paid: true,
            is_fully_paid: true,
            payment_method: true,
          },
        },
      },
    }),
    prisma.subscriber.count({ where }),
  ])

  return NextResponse.json({
    subscribers: subscribers.map(s => {
      const inv = s.invoices?.[0] ?? null
      return {
        ...s,
        invoices: undefined,
        amperage: Number(s.amperage),
        total_debt: Number(s.total_debt),
        current_invoice: inv ? {
          id: inv.id,
          invoice_number: inv.invoice_number,
          billing_month: inv.billing_month,
          billing_year: inv.billing_year,
          total_amount_due: Number(inv.total_amount_due),
          amount_paid: Number(inv.amount_paid),
          is_fully_paid: inv.is_fully_paid,
          payment_method: inv.payment_method,
        } : null,
      }
    }),
    total,
    pages: Math.ceil(total / limit),
    page,
    billing_month: currentBMonth,
    billing_year: currentBYear,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  try {
    const body = await req.json()
    const { name, phone, address, alley, alley_id, amperage, subscription_type, gps_lat, gps_lng, branch_id, generator_id, meter_number } = body

    if (!name || !amperage || !branch_id || !generator_id) {
      return NextResponse.json({ error: 'الحقول المطلوبة: الاسم، الأمبير، الفرع، المولد' }, { status: 400 })
    }

    // Generate serial number: sequential per branch
    const seq = await prisma.subscriber.count({ where: { branch_id } }) + 1
    const serial_number = String(seq).padStart(4, '0')

    const subscriber = await prisma.subscriber.create({
      data: {
        tenant_id: tenantId,
        branch_id,
        generator_id,
        serial_number,
        name,
        phone: phone || null,
        address: address || null,
        alley: alley || null,
        alley_id: alley_id || null,
        amperage,
        subscription_type: subscription_type || 'normal',
        gps_lat: gps_lat || null,
        gps_lng: gps_lng || null,
        meter_number: meter_number || null,
      },
    })

    // Auto-generate access code
    try {
      const branch = await prisma.branch.findUnique({ where: { id: branch_id } })
      const provKey = branch?.province_key || 'baghdad'
      const distKey = branch?.district_key || '01'
      const code = generateAccessCode(provKey, distKey, seq, generatePrivacyCode())
      if (code) {
        await prisma.subscriber.update({ where: { id: subscriber.id }, data: { access_code: code } })
      }
    } catch (e) { console.error('[subscribers] access code generation failed:', e) }

    // Auto-create invoice for active billing month
    try {
      const pricing = await prisma.monthlyPricing.findFirst({
        where: { branch_id },
        orderBy: { effective_from: 'desc' },
      })
      if (pricing) {
        const effDate = new Date(pricing.effective_from)
        const bMonth = effDate.getMonth() + 1
        const bYear = effDate.getFullYear()
        const subType = subscription_type || 'normal'
        const pricePerAmp = subType === 'gold'
          ? Number(pricing.price_per_amp_gold)
          : Number(pricing.price_per_amp_normal)
        const totalDue = Math.round(Number(amperage) * pricePerAmp)

        await prisma.invoice.create({
          data: {
            subscriber_id: subscriber.id,
            branch_id,
            tenant_id: tenantId,
            billing_month: bMonth,
            billing_year: bYear,
            base_amount: totalDue,
            total_amount_due: totalDue,
          },
        })
      }
    } catch {
      // Skip silently if invoice creation fails
    }

    // Auto-create public token for subscriber app
    try {
      await prisma.subscriberPublicToken.create({
        data: { subscriber_id: subscriber.id },
      })
    } catch {
      // Token may already exist
    }

    return NextResponse.json({ subscriber }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في إنشاء المشترك' }, { status: 500 })
  }
}
