import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assignBillerAccountNumbers } from '@/lib/aps/biller-number'

// Bulk-assign biller_account_no to subscribers who don't have one yet
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const count = await assignBillerAccountNumbers(user.tenantId)
    return NextResponse.json({
      ok: true,
      assigned: count,
      message: count > 0
        ? `تم تخصيص ${count} رقم فاتورة جديد للمشتركين`
        : 'كل المشتركين عندهم أرقام فواتير بالفعل',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
