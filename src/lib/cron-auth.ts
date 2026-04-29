/**
 * Cron auth helper.
 *
 * Modes:
 *   - If CRON_SECRET env var is set → require `X-Cron-Auth` header to match.
 *     Use this in production. Set the secret in deployment env vars and
 *     pass it from whichever scheduler triggers cron URLs (Vercel Cron,
 *     cron-job.org, GitHub Actions).
 *
 *   - If CRON_SECRET is unset → bypass (allow). This keeps local development
 *     convenient — `curl localhost:3002/api/cron/...` just works.
 *
 * Vercel Cron note: Vercel sends an `Authorization: Bearer ${CRON_SECRET}`
 * header automatically when CRON_SECRET is set in project env. We accept both
 * header names so the same handler works for Vercel Cron + custom triggers.
 */
import { NextRequest, NextResponse } from 'next/server';

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // Dev mode: no secret configured → allow.
  if (!secret) return null;

  // Vercel Cron uses `Authorization: Bearer <secret>`.
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return null;

  // Custom triggers can also use `X-Cron-Auth: <secret>`.
  const cronAuth = req.headers.get('x-cron-auth');
  if (cronAuth === secret) return null;

  // Legacy: existing run-all uses ?key=<secret>. Accept it for backward compat.
  const keyParam = req.nextUrl.searchParams.get('key');
  if (keyParam === secret) return null;

  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
