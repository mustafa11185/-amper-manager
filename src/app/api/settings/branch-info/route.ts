import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  // Accept optional branch_id query param (for owners switching branches)
  const qBranch = req.nextUrl.searchParams.get('branch_id')

  const branch = await prisma.branch.findFirst({
    where: {
      tenant_id: tenantId,
      is_active: true,
      ...(qBranch ? { id: qBranch } : {}),
    },
    select: {
      id: true, name: true, whatsapp_number: true, gps_lat: true, gps_lng: true, address: true,
      is_online_payment_enabled: true,
    },
  })

  if (!branch) return NextResponse.json({ error: 'لا يوجد فرع' }, { status: 404 })

  return NextResponse.json({
    branch_id: branch.id,
    name: branch.name,
    whatsapp_number: branch.whatsapp_number,
    gps_lat: branch.gps_lat ? Number(branch.gps_lat) : null,
    gps_lng: branch.gps_lng ? Number(branch.gps_lng) : null,
    address: branch.address,
    is_online_payment_enabled: branch.is_online_payment_enabled,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const tenantId = user.tenantId as string

  try {
    const { whatsapp_number, gps_lat, gps_lng, address, branch_id, is_online_payment_enabled } = await req.json()

    const branch = await prisma.branch.findFirst({
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(branch_id ? { id: branch_id } : {}),
      },
    })
    if (!branch) return NextResponse.json({ error: 'لا يوجد فرع' }, { status: 404 })

    await prisma.branch.update({
      where: { id: branch.id },
      data: {
        whatsapp_number: whatsapp_number || null,
        gps_lat: gps_lat != null ? gps_lat : null,
        gps_lng: gps_lng != null ? gps_lng : null,
        address: address || null,
        // Only update the toggle when the client explicitly sends it. Older
        // clients that omit the field don't accidentally flip it off.
        ...(typeof is_online_payment_enabled === 'boolean'
          ? { is_online_payment_enabled }
          : {}),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
