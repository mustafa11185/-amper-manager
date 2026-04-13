import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isGoldOrHigher } from '@/lib/plan'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  // Gate on business-tier+ via the shared helper so new plan
  // names (pro/business/corporate) are recognized.
  if (!isGoldOrHigher(user.plan)) {
    return NextResponse.json({ error: 'متاح في باقة الأعمال أو أعلى' }, { status: 403 })
  }

  const branchId = req.nextUrl.searchParams.get('branch_id') || user.branchId
  const month = parseInt(req.nextUrl.searchParams.get('month') || String(new Date().getMonth() + 1))
  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()))

  if (!branchId) {
    return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
  }

  const report = await prisma.aiReport.findUnique({
    where: {
      branch_id_month_year: { branch_id: branchId, month, year },
    },
  })

  return NextResponse.json({ report })
}
