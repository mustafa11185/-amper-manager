// WhatsApp alert sender — supports multiple providers.
// Add new providers here as needed.

type Provider = 'callmebot' | 'wasender' | 'twilio'

interface SendOptions {
  phone: string          // E.g., "9647801234567" (intl format, no +)
  message: string
  provider: Provider
  apiKey: string
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('0')) cleaned = '964' + cleaned.slice(1)
  return cleaned
}

// CallMeBot — free, requires user to register their number once at:
// https://www.callmebot.com/blog/free-api-whatsapp-messages/
async function sendCallMeBot(opts: SendOptions): Promise<boolean> {
  const phone = normalizePhone(opts.phone)
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(opts.message)}&apikey=${opts.apiKey}`
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok
  } catch (err) {
    console.error('[whatsapp/callmebot]', err)
    return false
  }
}

// Wasender API — paid, easier for Iraqi market
// Docs: https://wasenderapi.com
async function sendWasender(opts: SendOptions): Promise<boolean> {
  try {
    const res = await fetch('https://wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        to: normalizePhone(opts.phone),
        text: opts.message,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('[whatsapp/wasender]', err)
    return false
  }
}

// Twilio (sandbox/production)
// Requires apiKey in format "ACCOUNT_SID:AUTH_TOKEN:FROM_NUMBER"
async function sendTwilio(opts: SendOptions): Promise<boolean> {
  try {
    const [sid, token, from] = opts.apiKey.split(':')
    if (!sid || !token || !from) return false
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
    const body = new URLSearchParams({
      From: `whatsapp:+${from}`,
      To: `whatsapp:+${normalizePhone(opts.phone)}`,
      Body: opts.message,
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    return res.ok
  } catch (err) {
    console.error('[whatsapp/twilio]', err)
    return false
  }
}

export async function sendWhatsAppAlert(opts: SendOptions): Promise<boolean> {
  switch (opts.provider) {
    case 'callmebot': return sendCallMeBot(opts)
    case 'wasender':  return sendWasender(opts)
    case 'twilio':    return sendTwilio(opts)
    default: return false
  }
}

// Helper for cron — fetch tenant config and dispatch.
// Returns true if sent, false otherwise.
import { prisma } from './prisma'

export async function sendTenantAlert(tenantId: string, message: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      alerts_enabled: true,
      alert_phone: true,
      alert_provider: true,
      alert_api_key: true,
    },
  })

  if (!tenant?.alerts_enabled || !tenant.alert_phone || !tenant.alert_provider || !tenant.alert_api_key) {
    return false
  }

  return sendWhatsAppAlert({
    phone: tenant.alert_phone,
    message,
    provider: tenant.alert_provider as Provider,
    apiKey: tenant.alert_api_key,
  })
}

// Send WhatsApp to an arbitrary recipient (e.g., a subscriber's phone) using
// the tenant's saved provider+key. Different from sendTenantAlert because the
// destination is the customer, not the merchant. Returns false silently if
// the tenant has no provider configured — payment success path keeps working.
export async function sendSubscriberWhatsApp(
  tenantId: string,
  phone: string,
  message: string,
): Promise<boolean> {
  if (!phone) return false
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      alerts_enabled: true,
      alert_provider: true,
      alert_api_key: true,
    },
  })
  if (!tenant?.alerts_enabled || !tenant.alert_provider || !tenant.alert_api_key) {
    return false
  }
  return sendWhatsAppAlert({
    phone,
    message,
    provider: tenant.alert_provider as Provider,
    apiKey: tenant.alert_api_key,
  })
}
