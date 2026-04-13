// POST /api/staff/complaints
// Field complaint reported by a collector about a subscriber's
// service (outage, weak voltage, broken meter, etc.). Tenant-scoped.
// Also creates an `inactive_generator` style notification so the
// owner sees the complaint in the bell.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  outage: 'انقطاع التيار',
  weak_voltage: 'ضعف التيار',
  wrong_meter: 'عداد خاطئ',
  technical: 'مشكلة فنية',
  other: 'أخرى',
  // Arabic-key fallbacks (the Flutter UI sends Arabic strings today)
  'انقطاع التيار': 'انقطاع التيار',
  'ضعف التيار': 'ضعف التيار',
  'عداد خاطئ': 'عداد خاطئ',
  'مشكلة فنية': 'مشكلة فنية',
  'أخرى': 'أخرى',
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as { id?: string; name?: string; tenantId?: string; branchId?: string }
  if (!user.tenantId || !user.branchId) {
    return NextResponse.json({ error: 'tenant or branch missing' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const subscriberId = body.subscriber_id?.toString()
  const type = body.type?.toString()
  if (!subscriberId || !type) {
    return NextResponse.json({ error: 'subscriber_id and type are required' }, { status: 400 })
  }

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: { tenant_id: true, branch_id: true, name: true },
  })
  if (!subscriber || subscriber.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'subscriber_not_found' }, { status: 404 })
  }

  const complaint = await prisma.subscriberComplaint.create({
    data: {
      tenant_id: user.tenantId,
      branch_id: subscriber.branch_id,
      subscriber_id: subscriberId,
      staff_id: user.id ?? null,
      type,
      notes: body.notes?.toString() ?? null,
    },
  })

  // Notify the owner — uses the centralized helper so opt-outs still
  // apply if the owner disabled the "complaint" notification type.
  const typeLabel = TYPE_LABELS[type] ?? type
  await createNotification({
    tenant_id: user.tenantId,
    branch_id: subscriber.branch_id,
    type: 'subscriber_complaint',
    title: `بلاغ من ${user.name ?? 'الجابي'}: ${typeLabel}`,
    body: `${subscriber.name} — ${typeLabel}${body.notes ? ` (${body.notes})` : ''}`,
    payload: {
      complaint_id: complaint.id,
      subscriber_id: subscriberId,
      type,
    },
  }).catch((e) => console.warn('[complaints] notification failed:', e))

  return NextResponse.json({ ok: true, id: complaint.id })
}
