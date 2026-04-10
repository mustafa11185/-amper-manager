import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

// In-memory token store (resets on server restart — fine for read-only access)
const tokens = new Map<string, { partnerId: string; expiresAt: number }>()

export function getPartnerByToken(token: string): string | null {
  const entry = tokens.get(token)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token)
    return null
  }
  return entry.partnerId
}

// Rate limit
const attempts = new Map<string, { count: number; resetAt: number }>()
function rateLimit(ip: string): boolean {
  const now = Date.now()
  const e = attempts.get(ip)
  if (!e || e.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (e.count >= 10) return false
  e.count++
  return true
}

// POST /api/partner-portal/login  Body: { code }
// Partner logs in with their 6-digit access code → returns a session token
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  try {
    const { code } = await req.json()
    if (!code) return NextResponse.json({ error: 'الرمز مطلوب' }, { status: 400 })

    const partner = await prisma.partner.findUnique({
      where: { access_code: String(code) },
      select: { id: true, name: true, is_active: true, tenant_id: true },
    })
    if (!partner || !partner.is_active) {
      return NextResponse.json({ error: 'رمز غير صالح' }, { status: 401 })
    }

    // Check tenant has Corporate plan (or override)
    const tenant = await prisma.tenant.findUnique({
      where: { id: partner.tenant_id },
      select: { plan: true, feature_overrides: true, name: true },
    })
    const hasFeature = tenant && (
      ['corporate', 'fleet', 'custom'].includes(tenant.plan.toLowerCase()) ||
      (tenant.feature_overrides as string[]).includes('partner_login_dashboard')
    )
    if (!hasFeature) {
      return NextResponse.json(
        { error: 'هذه الميزة تتطلب باقة Corporate' },
        { status: 403 }
      )
    }

    // Issue token (24h)
    const token = randomBytes(32).toString('hex')
    tokens.set(token, {
      partnerId: partner.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })

    return NextResponse.json({
      token,
      partner: { id: partner.id, name: partner.name },
      tenant_name: tenant.name,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
