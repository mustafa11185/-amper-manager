import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// POST — generate or regenerate a 6-digit access code for a partner
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const tenantId = user.tenantId as string
  const { id } = await params

  const partner = await prisma.partner.findFirst({ where: { id, tenant_id: tenantId } })
  if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  // Generate unique code
  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const dup = await prisma.partner.findUnique({ where: { access_code: code } })
    if (!dup) break
    code = genCode()
  }

  await prisma.partner.update({
    where: { id },
    data: { access_code: code },
  })

  return NextResponse.json({ access_code: code })
}

// DELETE — revoke access
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const tenantId = user.tenantId as string
  const { id } = await params

  const partner = await prisma.partner.findFirst({ where: { id, tenant_id: tenantId } })
  if (!partner) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  await prisma.partner.update({
    where: { id },
    data: { access_code: null },
  })

  return NextResponse.json({ ok: true })
}
