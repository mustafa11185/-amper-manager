export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Allowed permission keys — anything else in the request body is dropped.
const ALLOWED_KEYS = new Set([
  'view_partners_list',
  'view_partners_balances',
  'view_revenue',
  'view_expenses',
  'view_subscribers_count',
  'view_iot_status',
  'request_withdrawal',
  'view_reports',
])

// PUT /api/partners/[id]/permissions
// Body: { permissions: { view_revenue: true, ... } }
// Owner-only. Replaces the partner's permissions JSON entirely.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'المالك فقط يمكنه تعديل صلاحيات الشركاء' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json()
    const incoming = (body?.permissions ?? {}) as Record<string, unknown>

    // Whitelist + coerce to boolean
    const sanitized: Record<string, boolean> = {}
    for (const key of Object.keys(incoming)) {
      if (ALLOWED_KEYS.has(key)) sanitized[key] = incoming[key] === true
    }

    // Make sure this partner belongs to the caller's tenant
    const existing = await prisma.partner.findUnique({
      where: { id },
      select: { tenant_id: true },
    })
    if (!existing) return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })
    if (existing.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const updated = await prisma.partner.update({
      where: { id },
      data: { permissions: sanitized },
      select: { id: true, permissions: true },
    })

    return NextResponse.json({ partner: updated })
  } catch (err: any) {
    console.error('[partners/permissions PUT]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
