import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const {
      name, phone, email, governorate,
      inquiry_type, message,
    } = await req.json()

    if (!name || !phone || !message) {
      return NextResponse.json(
        { error: 'الاسم والهاتف والرسالة مطلوبة' },
        { status: 400 }
      )
    }

    const inquiry = await prisma.contactInquiry.create({
      data: {
        name,
        phone,
        email: email ?? null,
        governorate: governorate ?? null,
        inquiry_type: inquiry_type ?? 'general',
        message,
        status: 'new',
      },
    })

    return NextResponse.json({
      ok: true,
      id: inquiry.id,
      message: 'شكراً! استلمنا طلبك وسنتواصل معك قريباً',
    })
  } catch (error: any) {
    console.error('[contact] error:', error)
    return NextResponse.json(
      { error: error.message ?? 'حدث خطأ' },
      { status: 500 }
    )
  }
}
