import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP || '9647801234567'

export async function POST(req: Request) {
  try {
    const {
      name, phone, governorate, generator_count,
      subscriber_count, plan_interest, billing_period, notes,
    } = await req.json()

    if (!name || !phone) {
      return NextResponse.json({ error: 'الاسم والهاتف مطلوبان' }, { status: 400 })
    }

    // Validate Iraqi phone number
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!/^(07[3-9]\d{8}|9647[3-9]\d{8}|\+9647[3-9]\d{8})$/.test(cleanPhone)) {
      return NextResponse.json({ error: 'رقم الهاتف غير صحيح — يجب أن يبدأ بـ 07' }, { status: 400 })
    }

    // Check for duplicate (same phone in last 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const existing = await prisma.trialRequest.findFirst({
      where: { phone: cleanPhone, created_at: { gte: dayAgo } },
    }).catch(() => null)

    if (existing) {
      return NextResponse.json({
        ok: true,
        id: existing.id,
        message: 'طلبك مسجل سابقاً — فريقنا سيتواصل معك قريباً',
        duplicate: true,
      })
    }

    const trial = await prisma.trialRequest.create({
      data: {
        name,
        phone: cleanPhone,
        governorate: governorate ?? null,
        generator_count: generator_count ?? 1,
        subscriber_count: subscriber_count ?? 0,
        plan_interest: plan_interest ?? null,
        billing_period: billing_period ?? null,
        notes: notes ?? null,
        source: 'landing',
        status: 'new',
      },
    })

    // Build WhatsApp deep link for team notification
    const planLabel = plan_interest === 'starter' ? 'Starter' :
      plan_interest === 'pro' ? 'Pro' :
      plan_interest === 'business' ? 'Business' :
      plan_interest === 'corporate' ? 'Corporate' :
      plan_interest === 'fleet' ? 'Fleet' : plan_interest ?? '-'

    const waMessage = [
      '🚀 طلب تجربة جديد!',
      '',
      `👤 ${name}`,
      `📱 ${cleanPhone}`,
      `📍 ${governorate ?? 'غير محدد'}`,
      `⚡ ${generator_count ?? 1} مولدة`,
      `👥 ${subscriber_count ?? 0} مشترك`,
      `📦 ${planLabel}`,
      notes ? `📝 ${notes}` : '',
      '',
      `⏰ ${new Date().toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}`,
    ].filter(Boolean).join('\n')

    return NextResponse.json({
      ok: true,
      id: trial.id,
      message: 'شكراً! سيتواصل معك فريقنا قريباً',
      // Return WhatsApp link so frontend can optionally open it
      wa_notify_url: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMessage)}`,
    })
  } catch (error: any) {
    console.error('[trial] error:', error)
    return NextResponse.json(
      { error: error.message ?? 'حدث خطأ' },
      { status: 500 }
    )
  }
}
