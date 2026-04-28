// AsiaPay Payment Gateway adapter.
//
// Docs: asiapay.iq/integration (PDF in /Desktop/payment-docs/asiapay-integration.pdf)
// UAT base: https://apitest.asiapay.iq:5443/apiaccess (override via creds.domain_url)
//
// Distinctive shape vs ZainCash/Qi:
//   - Two-step auth: POST /token with appSecret → Bearer token, used in
//     Authorization header for all subsequent calls.
//   - Every business request is wrapped in an envelope:
//       { biz_content: {...}, method, nonce_str, sign_type:"JWTSecret",
//         timestamp, version:"1.0", sign }
//     where `sign` is a JWT (HS256) over the rest of the envelope,
//     keyed by the merchant's `private_key` (a shared secret, despite the name).
//   - Requests/responses are NOT signed at the HTTP layer — only `sign` inside
//     the body. Webhook auth therefore relies on the same `sign` field.
//   - Order id is `merch_order_id` we generate; AsiaPay returns its own
//     `prepay_id` and `redirect_url`.
//
// NOTE: Until we exercise this against real AsiaPay test credentials, the
// exact JWT input shape (which fields are signed, in what order) is
// best-effort based on the published examples. If AsiaPay rejects with a
// signature error, the fix is to adjust the input passed to jwt.sign().

import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type {
  PaymentGateway,
  PaymentStatus,
  InitiateInput,
  InitiateResult,
  InquiryResult,
  ReverseResult,
  VerifiedCallback,
  AsiaPayCredentials,
} from './types'

const UAT_BASE = 'https://apitest.asiapay.iq:5443/apiaccess'

function mapStatus(s: string | undefined): PaymentStatus {
  switch (s?.toUpperCase()) {
    case 'PAY_SUCCESS':
    case 'SUCCESS':
      return 'success'
    case 'PAY_FAILED':
    case 'FAILED':
      return 'failed'
    case 'PAY_EXPIRED':
    case 'EXPIRED':
      return 'expired'
    case 'REFUND_SUCCESS':
    case 'REFUNDED':
      return 'refunded'
    case 'PAY_PENDING':
    case 'PENDING':
    case 'PAY_PROCESSING':
      return 'pending'
    default:
      return 'unknown'
  }
}

interface Envelope {
  biz_content: Record<string, unknown>
  method: string
  nonce_str: string
  sign_type: 'JWTSecret'
  timestamp: string
  version: '1.0'
  sign: string
}

export class AsiaPayGateway implements PaymentGateway {
  readonly name = 'asiapay' as const
  private readonly creds: AsiaPayCredentials
  private readonly baseUrl: string
  private cachedToken: { value: string; expiresAt: number } | null = null

  constructor(creds: AsiaPayCredentials, isTestMode: boolean) {
    this.creds = creds
    // domain_url is required per AsiaPay docs (different per env). Fall back
    // to UAT only when in test mode + no override.
    this.baseUrl = creds.domain_url || (isTestMode ? UAT_BASE : (() => {
      throw new Error('AsiaPay production domain_url must be set on credentials when is_test_mode=false')
    })())
  }

  // Build a signed envelope. AsiaPay docs show `sign` as a JWT (HS256) keyed
  // by the merchant's `private_key`. The input we sign is the envelope itself
  // minus the `sign` field — encoded as the JWT payload.
  private signEnvelope(method: string, biz_content: Record<string, unknown>): Envelope {
    const nonce_str = crypto.randomBytes(16).toString('hex')
    const timestamp = String(Math.floor(Date.now() / 1000))
    const unsigned = {
      biz_content,
      method,
      nonce_str,
      sign_type: 'JWTSecret' as const,
      timestamp,
      version: '1.0' as const,
    }
    const sign = jwt.sign(unsigned as object, this.creds.private_key, { algorithm: 'HS256' })
    return { ...unsigned, sign }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-APP-Key': this.creds.app_key,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.value
    }
    // Token request: { appSecret, sign }. The example shows the body itself
    // is signed; we pass appSecret in biz_content for consistency, then strip
    // it out at the outer level since the docs show it at the top level.
    const unsigned = { appSecret: this.creds.app_secret }
    const sign = jwt.sign(unsigned, this.creds.private_key, { algorithm: 'HS256' })
    const res = await fetch(`${this.baseUrl}/payment/gateway/payment/v1/token`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...unsigned, sign }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`AsiaPay token failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as { token?: string; effectiveDate?: string; expireDate?: string }
    if (!data.token) throw new Error('AsiaPay token response missing token')
    // Strip "Bearer " prefix if present (docs example includes it).
    const raw = data.token.replace(/^Bearer\s+/i, '')
    // Conservative cache: 50 min unless expireDate parses to something usable.
    this.cachedToken = { value: raw, expiresAt: Date.now() + 50 * 60 * 1000 }
    return raw
  }

  async testConnection(): Promise<{ ok: true }> {
    // Drop any cached bearer token so we re-exercise the /token endpoint
    // with the credentials the owner just saved.
    this.cachedToken = null
    await this.getToken()
    return { ok: true }
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const token = await this.getToken()
    const merch_order_id = input.externalRef
    const env = this.signEnvelope('payment.preorder', {
      appid: this.creds.app_id,
      business_type: 'BuyGoods',
      merch_code: this.creds.merchant_code,
      merch_order_id,
      redirect_url: input.successUrl,
      notify_url: input.failureUrl.replace('/api/payment/callback/', '/api/payments/webhook/'),
      timeout_express: '30m',
      title: input.serviceType || `Order ${input.orderId}`,
      total_amount: input.amountIqd.toFixed(2),
      trade_type: 'Checkout',
      trans_currency: 'IQD',
    })
    const res = await fetch(`${this.baseUrl}/payment/gateway/payment/v1/merchant/preOrder`, {
      method: 'POST',
      headers: this.headers({ 'Authorization': `Bearer ${token}` }),
      body: JSON.stringify(env),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`AsiaPay preOrder failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      result?: string
      code?: string
      msg?: string
      biz_content?: { merch_order_id?: string; prepay_id?: string; redirect_url?: string }
    }
    if (data.result !== 'SUCCESS' || !data.biz_content?.redirect_url) {
      throw new Error(`AsiaPay preOrder rejected: ${data.code} ${data.msg ?? ''}`)
    }
    return {
      // Use prepay_id (AsiaPay's internal id) as gatewayTxId; merch_order_id
      // is our externalRef and we pair them in OnlinePayment.gateway_ref.
      gatewayTxId: data.biz_content.prepay_id || merch_order_id,
      redirectUrl: data.biz_content.redirect_url,
      raw: data,
    }
  }

  async inquire(gatewayTxId: string): Promise<InquiryResult> {
    // Query by merch_order_id is the canonical lookup per docs. Our caller
    // passes either prepay_id OR merch_order_id; we prefer merch_order_id
    // when the value looks like our externalRef (UUID). Best-effort.
    const token = await this.getToken()
    const env = this.signEnvelope('payment.queryorder', {
      appid: this.creds.app_id,
      merch_code: this.creds.merchant_code,
      merch_order_id: gatewayTxId,
    })
    const res = await fetch(`${this.baseUrl}/payment/gateway/payment/v1/merchant/queryOrder`, {
      method: 'POST',
      headers: this.headers({ 'Authorization': `Bearer ${token}` }),
      body: JSON.stringify(env),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`AsiaPay queryOrder failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      result?: string
      biz_content?: {
        merch_order_id?: string
        order_status?: string
        trans_currency?: string
        total_amount?: string
        payment_order_id?: string
      }
    }
    return {
      status: mapStatus(data.biz_content?.order_status),
      amountIqd: Number(data.biz_content?.total_amount ?? 0),
      gatewayTxId: data.biz_content?.payment_order_id || gatewayTxId,
      raw: data,
    }
  }

  async reverse(gatewayTxId: string, reason: string): Promise<ReverseResult> {
    const token = await this.getToken()
    const env = this.signEnvelope('payment.refund', {
      appid: this.creds.app_id,
      merch_code: this.creds.merchant_code,
      merch_order_id: gatewayTxId,
      refund_request_no: `REFUND-${Date.now()}-${gatewayTxId.slice(0, 8)}`,
      refund_reason: reason,
    })
    const res = await fetch(`${this.baseUrl}/payment/gateway/payment/v1/merchant/refund`, {
      method: 'POST',
      headers: this.headers({ 'Authorization': `Bearer ${token}` }),
      body: JSON.stringify(env),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && (data as any)?.result === 'SUCCESS', raw: data }
  }

  // AsiaPay redirects to `redirect_url` after payment; the URL doesn't carry
  // a signed token. We trust only the order_status returned by a fresh
  // queryOrder call — same defense as Qi's verifyRedirect.
  async verifyRedirect(query: URLSearchParams): Promise<VerifiedCallback> {
    const merch_order_id = query.get('merch_order_id') || query.get('orderId')
    if (!merch_order_id) throw new Error('AsiaPay redirect missing merch_order_id')
    const inq = await this.inquire(merch_order_id)
    return {
      externalRef: merch_order_id,
      gatewayTxId: inq.gatewayTxId,
      status: inq.status,
      raw: inq.raw,
    }
  }

  // AsiaPay webhook: signed envelope. We verify the `sign` JWT with our
  // private_key, then re-inquire as belt-and-suspenders.
  async verifyWebhook(body: unknown): Promise<VerifiedCallback> {
    const env = body as Partial<Envelope>
    const sign = env?.sign
    if (!sign) throw new Error('AsiaPay webhook missing sign')
    try {
      jwt.verify(sign, this.creds.private_key, { algorithms: ['HS256'] })
    } catch (e: any) {
      throw new Error(`AsiaPay webhook signature invalid: ${e.message}`)
    }
    const merch_order_id = (env.biz_content as any)?.merch_order_id
    if (!merch_order_id) throw new Error('AsiaPay webhook missing merch_order_id')
    const inq = await this.inquire(merch_order_id)
    return {
      externalRef: merch_order_id,
      gatewayTxId: inq.gatewayTxId,
      status: inq.status,
      raw: { webhook: env, inquiry: inq.raw },
    }
  }
}
