import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

// Sessions live in the partner_sessions table now (replaces the old
// in-memory Map that was wiped on every Render restart). Token format
// stays the same: 64 hex chars in the Authorization: Bearer header.
export async function getPartnerByToken(token: string): Promise<string | null> {
  if (!token) return null
  try {
    const session = await prisma.partnerSession.findUnique({
      where: { token },
      select: { partner_id: true, expires_at: true },
    })
    if (!session) return null
    if (session.expires_at < new Date()) {
      // Best-effort cleanup of the expired row.
      await prisma.partnerSession.delete({ where: { token } }).catch(() => {})
      return null
    }
    return session.partner_id
  } catch (err: any) {
    console.warn('[partner-portal/getPartnerByToken]', err.message)
    return null
  }
}

// Lightweight in-memory rate limit (per IP). The login attempts
// volume is so low that DB-backed throttling would be overkill.
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

// Plans that may use the partner login feature. Owner controls this by
// upgrading their tenant. Business+ unlocks the basic login; Corporate
// unlocks the advanced features (other-partners view, financials, etc.).
const PARTNER_LOGIN_PLANS = new Set(['business', 'corporate', 'fleet', 'custom', 'gold'])

// POST /api/partner-portal/login  Body: { code }
// Partner enters their 6-digit access code → returns a 30-day session token
// + the partner's display name + tenant info.
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

    // Check the owner's tenant has Business+ (or an explicit override).
    let tenant: { plan: string; feature_overrides: string[]; name: string } | null = null
    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: partner.tenant_id },
        select: { plan: true, feature_overrides: true, name: true },
      }) as any
    } catch (err: any) {
      console.warn('[partner-portal/login] tenant lookup failed:', err.message)
    }
    if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

    const overrides = (tenant.feature_overrides as string[] | null) ?? []
    const allowed = PARTNER_LOGIN_PLANS.has(tenant.plan.toLowerCase())
      || overrides.includes('partner_login_basic')
      || overrides.includes('partner_login_dashboard') // legacy override key
    if (!allowed) {
      return NextResponse.json(
        { error: 'هذه الميزة تتطلب باقة Business أو أعلى' },
        { status: 403 }
      )
    }

    // Issue a 6-month session, persisted in DB so it survives restarts.
    // Long sessions match the partner usage pattern — they only check
    // their balance every few weeks and shouldn't have to keep entering
    // their code.
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    await prisma.partnerSession.create({
      data: { partner_id: partner.id, token, expires_at: expiresAt },
    })

    return NextResponse.json({
      token,
      expires_at: expiresAt.toISOString(),
      partner: { id: partner.id, name: partner.name },
      tenant_name: tenant.name,
    })
  } catch (err: any) {
    console.error('[partner-portal/login]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/partner-portal/login — partner-side logout. Removes the
// session row so the token can never be reused.
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ ok: true })
  try {
    await prisma.partnerSession.delete({ where: { token } })
  } catch {}
  return NextResponse.json({ ok: true })
}
