export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerByToken } from '../login/route'

// GET /api/partner-portal/partners
// Returns the other partners on the same tenant. Requires the
// `view_partners_list` permission. Balances are only included when
// `view_partners_balances` is also enabled — otherwise the response
// shows just names + share percentages.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partnerId = await getPartnerByToken(token)
  if (!partnerId) return NextResponse.json({ error: 'invalid_token' }, { status: 401 })

  const me = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { tenant_id: true, permissions: true },
  })
  if (!me) return NextResponse.json({ error: 'partner_not_found' }, { status: 404 })

  const perms = (me.permissions ?? {}) as Record<string, boolean>
  if (perms.view_partners_list !== true) {
    return NextResponse.json({ error: 'forbidden', reason: 'permission_denied' }, { status: 403 })
  }

  const showBalances = perms.view_partners_balances === true

  const partners = await prisma.partner.findMany({
    where: { tenant_id: me.tenant_id, is_active: true },
    select: {
      id: true,
      name: true,
      joined_at: true,
      shares: { where: { effective_to: null }, select: { percentage: true } },
    },
    orderBy: { joined_at: 'asc' },
  })

  // Optionally fetch balances per partner
  const balanceMap = new Map<string, number>()
  if (showBalances) {
    const ids = partners.map(p => p.id)
    const [contribs, withdraws] = await Promise.all([
      prisma.partnerContribution.groupBy({
        by: ['partner_id'],
        where: { partner_id: { in: ids } },
        _sum: { amount: true },
      }),
      prisma.partnerWithdrawal.groupBy({
        by: ['partner_id'],
        where: { partner_id: { in: ids } },
        _sum: { amount: true },
      }),
    ])
    for (const c of contribs) {
      balanceMap.set(c.partner_id, (balanceMap.get(c.partner_id) ?? 0) + Number(c._sum.amount ?? 0))
    }
    for (const w of withdraws) {
      balanceMap.set(w.partner_id, (balanceMap.get(w.partner_id) ?? 0) - Number(w._sum.amount ?? 0))
    }
  }

  return NextResponse.json({
    partners: partners.map(p => {
      const totalPct = p.shares.reduce((s, sh) => s + Number(sh.percentage), 0)
      const avgPct = p.shares.length > 0 ? totalPct / p.shares.length : 0
      return {
        id: p.id,
        name: p.name,
        joined_at: p.joined_at,
        share_percent: avgPct,
        is_me: p.id === partnerId,
        balance: showBalances ? (balanceMap.get(p.id) ?? 0) : null,
      }
    }),
    show_balances: showBalances,
  })
}
