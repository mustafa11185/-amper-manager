import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function genPairingCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  const tenantId = user.tenantId as string
  const { id } = await params

  const existing = await prisma.iotDevice.findFirst({ where: { id, tenant_id: tenantId } })
  if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  let code = genPairingCode()
  for (let i = 0; i < 5; i++) {
    const dup = await prisma.iotDevice.findUnique({ where: { pairing_code: code } })
    if (!dup) break
    code = genPairingCode()
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  const device = await prisma.iotDevice.update({
    where: { id },
    data: { pairing_code: code, pairing_expires_at: expiresAt, paired_at: null },
  })

  return NextResponse.json({ device })
}
