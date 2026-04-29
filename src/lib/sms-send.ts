// SMS fallback for cases where the WhatsApp provider failed to deliver.
//
// Currently supports only Cellsoft Mobile (Iraqi local SMS gateway). The
// schema keeps `sms_endpoint` overridable so we don't have to redeploy when
// Cellsoft rotates a customer onto a different shard.

import { prisma } from './prisma'

type SmsProvider = 'cellsoft'

interface SendSmsOptions {
  phone: string
  message: string
  provider: SmsProvider
  apiKey: string
  sender?: string | null
  endpoint?: string | null
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('0')) cleaned = '964' + cleaned.slice(1)
  return cleaned
}

// Cellsoft pattern: HTTP POST with form-encoded body. The exact field names
// follow their documented contract; we keep the call defensive (treats any
// non-2xx as failure, never throws) so the caller can chain provider tries.
async function sendCellsoft(opts: SendSmsOptions): Promise<boolean> {
  const endpoint = opts.endpoint || 'https://sms.cellsoft.com.iq/api/send'
  const [username, password] = (opts.apiKey || '').split(':')
  if (!username || !password) {
    console.warn('[sms/cellsoft] api key must be "username:password"')
    return false
  }
  const body = new URLSearchParams({
    username, password,
    sender: opts.sender ?? 'AMPER',
    mobile: normalizePhone(opts.phone),
    message: opts.message,
  })
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return res.ok
  } catch (err: any) {
    console.error('[sms/cellsoft]', err?.message ?? err)
    return false
  }
}

export async function sendSms(opts: SendSmsOptions): Promise<boolean> {
  switch (opts.provider) {
    case 'cellsoft': return sendCellsoft(opts)
    default: return false
  }
}

// Tenant-aware send. Returns false silently when no SMS provider is set so
// callers can chain it after a WhatsApp attempt without conditional plumbing.
export async function sendTenantSms(tenantId: string, phone: string, message: string): Promise<boolean> {
  if (!phone) return false
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { sms_provider: true, sms_api_key: true, sms_sender: true, sms_endpoint: true },
  })
  if (!tenant?.sms_provider || !tenant.sms_api_key) return false
  return sendSms({
    phone, message,
    provider: tenant.sms_provider as SmsProvider,
    apiKey: tenant.sms_api_key,
    sender: tenant.sms_sender,
    endpoint: tenant.sms_endpoint,
  })
}
