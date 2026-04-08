import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const staffId = (session.user as any).id

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        can_collect: true,
        can_operate: true,
        can_send_announcements: true,
        can_send_urgent: true,
        can_view_phones: true,
        can_view_others_debt: true,
        can_view_wallet: true,
        can_view_salary: true,
        can_send_whatsapp: true,
        can_add_expenses: true,
        can_check_in: true,
        track_location: true,
        is_active: true,
        collector_permission: {
          select: {
            can_give_discount: true,
            discount_max_amount: true,
          }
        }
      }
    })

    if (!staff)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Flatten to match expected format
    const permissions = {
      can_collect: staff.can_collect,
      can_operate: staff.can_operate,
      can_send_announcements: staff.can_send_announcements,
      can_send_urgent: staff.can_send_urgent,
      can_view_phones: staff.can_view_phones,
      can_view_others_debt: staff.can_view_others_debt,
      can_view_wallet: staff.can_view_wallet,
      can_view_salary: staff.can_view_salary,
      can_send_whatsapp: staff.can_send_whatsapp,
      can_add_expenses: staff.can_add_expenses,
      can_check_in: staff.can_check_in,
      track_location: staff.track_location,
      is_active: staff.is_active,
      can_give_discount: staff.collector_permission?.can_give_discount ?? false,
      discount_max_amount: staff.collector_permission?.discount_max_amount ?? 0,
    }

    return NextResponse.json({ permissions })
  } catch (err: any) {
    console.error('[my-permissions] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
