/**
 * POST /api/billing/test-amper-gateway
 *
 * Internal endpoint called by company-admin when the user clicks "Test Connection"
 * for one of Amper's gateways. Resolves credentials from DB-or-env and runs the
 * adapter's `testConnection()` method (an auth-only probe that doesn't create
 * a transaction).
 *
 * Auth: shared internal secret via `X-Internal-Auth` header. Not exposed to
 * end users — the company-admin proxies the request.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAmperGateway } from '@/lib/saas-billing';
import type { GatewayName } from '@/lib/payments/types';

const VALID: GatewayName[] = ['zaincash', 'qi', 'asiapay'];

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-internal-auth');
  const expected = process.env.INTERNAL_API_KEY || 'dev';
  if (auth !== expected) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const gateway = body?.gateway;
  if (!VALID.includes(gateway)) {
    return NextResponse.json({ error: 'INVALID_GATEWAY' }, { status: 400 });
  }

  try {
    const adapter = await getAmperGateway(gateway as GatewayName);
    await adapter.testConnection();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: 'TEST_FAILED', message: msg }, { status: 502 });
  }
}
