import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const { token, platform } = await req.json()

    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    // Upsert device token
    await prisma.staffDevice.upsert({
      where: {
        staff_id_fcm_token: {
          staff_id: user.id,
          fcm_token: token,
        },
      },
      update: {
        platform: platform || 'android',
        is_active: true,
        updated_at: new Date(),
      },
      create: {
        staff_id: user.id,
        fcm_token: token,
        platform: platform || 'android',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[device-token]', e)
    return NextResponse.json({ error: e.message || 'خطأ' }, { status: 500 })
  }
}

// Deactivate a device token (logout)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any

  try {
    const { token } = await req.json()

    if (token) {
      await prisma.staffDevice.updateMany({
        where: { staff_id: user.id, fcm_token: token },
        data: { is_active: false },
      })
    } else {
      // Deactivate all devices for this staff
      await prisma.staffDevice.updateMany({
        where: { staff_id: user.id },
        data: { is_active: false },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'خطأ' }, { status: 500 })
  }
}
