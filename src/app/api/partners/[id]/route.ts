import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const { id } = await params

  const partner = await prisma.partner.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      shares: { orderBy: { created_at: 'desc' } },
    },
  })
  if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  return NextResponse.json({ partner })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const tenantId = user.tenantId as string
  const { id } = await params

  try {
    const { name, phone, national_id, notes, is_active, shares } = await req.json()

    const existing = await prisma.partner.findFirst({ where: { id, tenant_id: tenantId } })
    if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

    const partner = await prisma.partner.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(national_id !== undefined ? { national_id: national_id || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
      },
    })

    // Replace shares (close old, create new)
    if (Array.isArray(shares)) {
      await prisma.partnerShare.updateMany({
        where: { partner_id: id, effective_to: null },
        data: { effective_to: new Date() },
      })
      if (shares.length > 0) {
        await prisma.partnerShare.createMany({
          data: shares.map((s: any) => ({
            tenant_id: tenantId,
            partner_id: id,
            scope_type: s.scope_type ?? 'tenant',
            scope_id: s.scope_id ?? null,
            percentage: Number(s.percentage),
          })),
        })
      }
    }

    return NextResponse.json({ partner })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const tenantId = user.tenantId as string
  const { id } = await params

  const existing = await prisma.partner.findFirst({ where: { id, tenant_id: tenantId } })
  if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  // Soft-delete: mark inactive (preserves history)
  await prisma.partner.update({
    where: { id },
    data: { is_active: false },
  })

  return NextResponse.json({ ok: true })
}
