import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isGoldOrHigher } from '@/lib/plan'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = (session.user as any).plan
  // Gate on "business tier or higher" — the old check for
  // plan === 'basic' never caught the new 'pro' plan, and after
  // the rename every pro tenant could hit this endpoint.
  if (!isGoldOrHigher(plan)) {
    return NextResponse.json({ error: 'متاح في باقة الأعمال أو أعلى' }, { status: 403 })
  }

  try {
    const { message } = await req.json()

    // Placeholder — will integrate with AI service
    return NextResponse.json({
      reply: 'مرحباً! هذه الميزة قيد التطوير. ستتمكن قريباً من الحصول على تحليلات ذكية لمولدك.',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
