// Owner-only CRUD for per-tenant payment-gateway credentials.
// GET  → list configured gateways (no plaintext leaves the server)
// POST → upsert one gateway's credentials (encrypted at rest)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  listConfiguredGateways,
  saveCredentials,
  type GatewayName,
  type GatewayCredentialsByName,
} from '@/lib/payments'

const GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'غير مصرح — المالك فقط' }, { status: 403 })
  }
  const rows = await listConfiguredGateways(user.tenantId as string)
  return NextResponse.json({ gateways: rows })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'غير مصرح — المالك فقط' }, { status: 403 })
  }
  const tenantId = user.tenantId as string

  const body = await req.json()
  const gateway = body.gateway as GatewayName
  if (!GATEWAYS.includes(gateway)) {
    return NextResponse.json({ error: 'بوابة غير معروفة' }, { status: 400 })
  }

  // Validate the credential shape per gateway. Reject early so a typo in the
  // owner's input doesn't get encrypted and stored.
  const creds = body.credentials
  if (!creds || typeof creds !== 'object') {
    return NextResponse.json({ error: 'بيانات الاعتماد مطلوبة' }, { status: 400 })
  }

  const required: Record<GatewayName, string[]> = {
    zaincash: ['client_id', 'client_secret', 'api_key', 'service_type'],
    qi: ['username', 'password', 'terminal_id'],
    asiapay: ['app_id', 'app_key', 'app_secret', 'private_key', 'merchant_code', 'domain_url'],
  }
  for (const f of required[gateway]) {
    if (!creds[f] || typeof creds[f] !== 'string' || !creds[f].trim()) {
      return NextResponse.json({ error: `الحقل ${f} مطلوب` }, { status: 400 })
    }
  }

  await saveCredentials({
    tenantId,
    gateway,
    credentials: creds as GatewayCredentialsByName[typeof gateway],
    isEnabled: body.is_enabled === true,
    isDefault: body.is_default === true,
    isTestMode: body.is_test_mode !== false, // default to test mode for safety
    displayName: body.display_name || null,
  })

  return NextResponse.json({ ok: true })
}
