import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = session.user.id

  const perms = await prisma.$queryRaw`
    SELECT
      cp.can_give_discount,
      cp.discount_max_amount,
      cp.can_collect,
      cp.can_operate,
      s.can_send_announcements,
      s.can_send_urgent,
      s.can_view_phones,
      s.can_view_others_debt,
      s.can_view_wallet,
      s.can_view_salary,
      s.can_send_whatsapp,
      s.can_add_expenses,
      s.can_check_in,
      s.is_active
    FROM staff s
    LEFT JOIN collector_permissions cp ON cp.staff_id = s.id
    WHERE s.id = ${staffId}::uuid
    LIMIT 1
  ` as any[]

  if (!perms.length)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ permissions: perms[0] })
}
