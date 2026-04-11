// PATCH /api/suppliers/[id]   — update name/phone/type/notes/is_active
// DELETE /api/suppliers/[id]  — soft-delete (sets is_active=false)
//                               so historical expenses keep their link.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureOwnership(id: string, tenantId: string) {
  const s = await prisma.supplier.findUnique({ where: { id } })
  if (!s) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (s.tenant_id !== tenantId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { supplier: s }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  try {
    const check = await ensureOwnership(id, user.tenantId)
    if (check.error) return check.error

    const body = await req.json()
    const data: any = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null
    if (body.supplier_type !== undefined) {
      const allowed = ['fuel', 'oil', 'spare_parts', 'service', 'other']
      data.supplier_type = allowed.includes(body.supplier_type) ? body.supplier_type : 'other'
    }
    if (body.is_active !== undefined) data.is_active = body.is_active === true

    const supplier = await prisma.supplier.update({ where: { id }, data })
    return NextResponse.json({ ok: true, supplier })
  } catch (err: any) {
    console.error('[suppliers PATCH]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  try {
    const check = await ensureOwnership(id, user.tenantId)
    if (check.error) return check.error

    // Soft delete — historical expenses keep their supplier link.
    await prisma.supplier.update({
      where: { id },
      data: { is_active: false },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[suppliers DELETE]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
