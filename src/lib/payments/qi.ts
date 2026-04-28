// QiCard Payment Gateway adapter.
//
// Docs: developers-gate.qi.iq (PDFs in /Desktop/payment-docs/qi-*.pdf)
// UAT: https://uat-sandbox-3ds-api.qi.iq
// Production: provided to merchant after onboarding (override via base_url).
//
// Auth: HTTP Basic on every request; `X-Terminal-Id` header identifies the
// merchant terminal. RSA signature-based auth is supported but Basic Auth is
// fine over HTTPS and avoids key-management overhead per tenant.
//
// Flow vs ZainCash differences:
// - Idempotency key is `requestId` (we use the same value as our externalRef).
// - Currency value uses 2 decimal places (e.g., "256.89") — Qi rejects integer
//   IQD amounts on some endpoints. We send `Number(amountIqd.toFixed(2))`.
// - Customer redirect lands on `finishPaymentUrl` (we set it during init).
//   Qi appends nothing reliably — handler must look up by paymentId from the
//   URL pattern OR call inquire() to refresh.
// - Webhook: Qi POSTs the raw payment object (not a JWT) to `notificationUrl`.
//   Auth comes from URL secrecy (per-tenant /api/payments/webhook/qi/<tenantId>)
//   and HTTPS — no signature header to verify. The `paymentId` in the body
//   anchors the lookup; we double-check by calling inquire() to fetch the
//   authoritative status.

import type {
  PaymentGateway,
  PaymentStatus,
  InitiateInput,
  InitiateResult,
  InquiryResult,
  ReverseResult,
  VerifiedCallback,
  QiCredentials,
} from './types'

const UAT_BASE = 'https://uat-sandbox-3ds-api.qi.iq'

function mapStatus(s: string | undefined, canceled?: boolean): PaymentStatus {
  if (canceled) return 'failed'
  switch (s?.toUpperCase()) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
    case 'AUTHENTICATION_FAILED':
      return 'failed'
    case 'CREATED':
      return 'pending'
    default:
      return 'unknown'
  }
}

export class QiGateway implements PaymentGateway {
  readonly name = 'qi' as const
  private readonly creds: QiCredentials
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(creds: QiCredentials, isTestMode: boolean) {
    this.creds = creds
    this.baseUrl = creds.base_url || (isTestMode ? UAT_BASE : (() => {
      throw new Error('Qi production base_url must be set on credentials when is_test_mode=false')
    })())
    this.authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64')
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Authorization': this.authHeader,
      'X-Terminal-Id': this.creds.terminal_id,
      ...extra,
    }
  }

  async testConnection(): Promise<{ ok: true }> {
    // Qi has no auth-only endpoint, so we probe a status lookup with a
    // bogus paymentId. Expected outcomes:
    //   - 401/403 → wrong username/password (Basic Auth rejected)
    //   - 404 / business-error JSON → auth OK, payment just doesn't exist
    //   - 5xx → upstream issue, surface as error
    // Anything other than a 401-class response counts as success.
    const res = await fetch(`${this.baseUrl}/api/v1/payment/__amper-test__/status`, {
      method: 'GET',
      headers: this.headers(),
    })
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '')
      throw new Error(`Qi auth rejected: HTTP ${res.status} ${text}`)
    }
    if (res.status >= 500) {
      throw new Error(`Qi upstream error: HTTP ${res.status}`)
    }
    return { ok: true }
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    // Qi expects amount as a number with up to 2 decimals; 0.00 format.
    const body = {
      requestId: input.externalRef,
      amount: Number(input.amountIqd.toFixed(2)),
      currency: 'IQD',
      locale: input.language === 'ar' ? 'ar_IQ' : 'en_US',
      finishPaymentUrl: input.successUrl,
      // For Qi the same notification URL handles both success and failure
      // (the webhook body's `status` tells us which).
      notificationUrl: input.failureUrl.replace('/api/payment/callback/', '/api/payments/webhook/'),
      customerInfo: input.customerPhone ? { phone: input.customerPhone } : undefined,
      appChannel: false,
    }
    const res = await fetch(`${this.baseUrl}/api/v1/payment`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Qi create payment failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      paymentId?: string
      formUrl?: string
      creationDate?: string
    }
    if (!data.paymentId || !data.formUrl) {
      throw new Error('Qi create payment response missing paymentId or formUrl')
    }
    return {
      redirectUrl: data.formUrl,
      gatewayTxId: data.paymentId,
      raw: data,
    }
  }

  async inquire(gatewayTxId: string): Promise<InquiryResult> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/payment/${encodeURIComponent(gatewayTxId)}/status`,
      { headers: this.headers() }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Qi inquiry failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      paymentId: string
      status?: string
      canceled?: boolean
      amount?: number
      creationDate?: string
    }
    return {
      status: mapStatus(data.status, data.canceled),
      amountIqd: Number(data.amount ?? 0),
      gatewayTxId: data.paymentId,
      completedAt: data.creationDate ? new Date(data.creationDate) : undefined,
      raw: data,
    }
  }

  async reverse(gatewayTxId: string, reason: string): Promise<ReverseResult> {
    // Qi requires the original amount to refund. Resolve it via inquiry so
    // the caller doesn't have to thread it through.
    const inq = await this.inquire(gatewayTxId)
    const res = await fetch(
      `${this.baseUrl}/api/v1/payment/${encodeURIComponent(gatewayTxId)}/refund`,
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          requestId: `refund-${Date.now()}-${gatewayTxId.slice(0, 8)}`,
          amount: Number(inq.amountIqd.toFixed(2)),
          message: reason,
        }),
      }
    )
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, raw: data }
  }

  // Qi redirects with `?paymentId=...` (not a signed token). To get the
  // authoritative status we have to call inquire(). This costs one HTTP
  // round-trip per redirect, which is fine — redirects are user-driven.
  async verifyRedirect(query: URLSearchParams): Promise<VerifiedCallback> {
    const paymentId = query.get('paymentId')
    if (!paymentId) throw new Error('Qi redirect missing ?paymentId=')
    const inq = await this.inquire(paymentId)
    // We don't have the externalRef in the redirect; the caller must look
    // up OnlinePayment by gatewayTxId. Set externalRef='' as a sentinel so
    // the handler knows to use gatewayTxId-based lookup instead.
    return {
      externalRef: '',
      gatewayTxId: paymentId,
      status: inq.status,
      raw: inq.raw,
    }
  }

  // Qi webhook body shape mirrors the inquiry response. We don't sign-verify
  // (URL secrecy is the auth boundary) but we DO call inquire() to defeat
  // any attacker who guesses the URL and POSTs a fake "SUCCESS" body.
  async verifyWebhook(body: unknown): Promise<VerifiedCallback> {
    const payload = body as { paymentId?: string; requestId?: string }
    const paymentId = payload?.paymentId
    if (!paymentId) throw new Error('Qi webhook missing paymentId')
    // Re-inquire so the webhook can't be spoofed by anyone who knows the URL.
    const inq = await this.inquire(paymentId)
    return {
      externalRef: payload.requestId || '',
      gatewayTxId: paymentId,
      status: inq.status,
      raw: { webhook: payload, inquiry: inq.raw },
    }
  }
}
