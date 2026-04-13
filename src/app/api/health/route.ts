import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public liveness probe — returns only ok/error plus DB reachability.
// Must not expose NEXTAUTH_URL, NODE_ENV, or any other env fingerprint;
// those let attackers tell which deployment they're hitting.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
