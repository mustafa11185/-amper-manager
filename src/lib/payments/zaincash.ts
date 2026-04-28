// ZainCash Payment Gateway v2 adapter.
//
// Docs: docs.zaincash.iq (PDF in /Desktop/Amper-V2/ZainCash...v2.pdf).
// UAT base URL: https://pg-api-uat.zaincash.iq
// Prod base URL: provided to merchant during onboarding (pass via creds.base_url).
//
// Notable quirks vs other gateways:
// - Webhooks fire ONLY in production. UAT verification has to use redirect
//   callback + inquiry polling.
// - Idempotency key is `externalReferenceId` and MUST be a UUID.
// - Currency must be "IQD"; amounts are sent as a string.
// - Redirect callback delivers a JWT in `?token=...`; verify with `api_key`
//   (HS256). Same scheme for webhooks (`{ webhook_token }` POST body).

import jwt from 'jsonwebtoken'
import type {
  PaymentGateway,
  PaymentStatus,
  InitiateInput,
  InitiateResult,
  InquiryResult,
  ReverseResult,
  VerifiedCallback,
  ZainCashCredentials,
} from './types'

const UAT_BASE = 'https://pg-api-uat.zaincash.iq'

// Map ZainCash status strings -> our PaymentStatus.
function mapStatus(s: string | undefined): PaymentStatus {
  switch (s?.toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED':
      return 'success'
    case 'FAILED':
      return 'failed'
    case 'EXPIRED':
      return 'expired'
    case 'REFUNDED':
      return 'refunded'
    case 'PENDING':
    case 'OTP_SENT':
    case 'CUSTOMER_AUTHENTICATION_REQUIRED':
      return 'pending'
    default:
      return 'unknown'
  }
}

export class ZainCashGateway implements PaymentGateway {
  readonly name = 'zaincash' as const
  private readonly creds: ZainCashCredentials
  private readonly baseUrl: string
  // Cache the OAuth token in-memory per adapter instance. ZainCash tokens have
  // an expiry (~hour); we refresh on 401. Adapter instances are short-lived
  // (per request) so this is mostly a noop, but it saves a token call when the
  // same request inquires multiple transactions.
  private cachedToken: { value: string; expiresAt: number } | null = null

  constructor(creds: ZainCashCredentials, isTestMode: boolean) {
    this.creds = creds
    this.baseUrl = creds.base_url || (isTestMode ? UAT_BASE : (() => {
      throw new Error('ZainCash production base_url must be set on credentials when is_test_mode=false')
    })())
  }

  // OAuth2 client_credentials → bearer token.
  private async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.value
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.creds.client_id,
      client_secret: this.creds.client_secret,
      scope: 'payment:read payment:write reverse:write',
    })
    const res = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`ZainCash token failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as { access_token: string; expires_in?: number }
    if (!data.access_token) throw new Error('ZainCash token response missing access_token')
    // Conservative expiry: docs don't specify expires_in reliably. Cache for 50min.
    const ttlSec = data.expires_in && data.expires_in > 60 ? data.expires_in - 60 : 3000
    this.cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlSec * 1000 }
    return data.access_token
  }

async testConnection(): Promise<{ ok: true }> {
    // Force a fresh token call (don't reuse cache) so the owner gets honest
    // feedback right after editing credentials.
    this.cachedToken = null
    await this.getToken()
    return { ok: true }
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const token = await this.getToken()
    const body = {
      language: input.language || 'ar',
      externalReferenceId: input.externalRef, // must be UUID
      orderId: input.orderId,
      serviceType: input.serviceType || this.creds.service_type,
      amount: { value: String(input.amountIqd), currency: 'IQD' },
      customer: input.customerPhone ? { phone: input.customerPhone } : undefined,
      redirectUrls: { successUrl: input.successUrl, failureUrl: input.failureUrl },
    }
    const res = await fetch(`${this.baseUrl}/api/v2/payment-gateway/transaction/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`ZainCash init failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      transactionDetails?: { transactionId?: string }
      redirectUrl?: string
      expiryTime?: string
    }
    const gatewayTxId = data.transactionDetails?.transactionId
    const redirectUrl = data.redirectUrl
    if (!gatewayTxId || !redirectUrl) {
      throw new Error('ZainCash init response missing transactionId or redirectUrl')
    }
    return {
      redirectUrl,
      gatewayTxId,
      expiresAt: data.expiryTime ? new Date(data.expiryTime) : undefined,
      raw: data,
    }
  }

  async inquire(gatewayTxId: string): Promise<InquiryResult> {
    const token = await this.getToken()
    const res = await fetch(
      `${this.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(gatewayTxId)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`ZainCash inquiry failed: HTTP ${res.status} ${text}`)
    }
    const data = await res.json() as {
      status?: string
      transactionDetails?: { transactionId: string; amount?: { value: number; feeValue?: number } }
      timeStamps?: { completedAt?: string | null }
    }
    return {
      status: mapStatus(data.status),
      amountIqd: Number(data.transactionDetails?.amount?.value ?? 0),
      feeIqd: Number(data.transactionDetails?.amount?.feeValue ?? 0),
      gatewayTxId: data.transactionDetails?.transactionId ?? gatewayTxId,
      completedAt: data.timeStamps?.completedAt ? new Date(data.timeStamps.completedAt) : undefined,
      raw: data,
    }
  }

  async reverse(gatewayTxId: string, reason: string): Promise<ReverseResult> {
    const token = await this.getToken()
    const res = await fetch(`${this.baseUrl}/api/v2/payment-gateway/transaction/reverse`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transactionId: gatewayTxId, reason }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, raw: data }
  }

  // ZainCash signs every callback (redirect + webhook) as a JWT. Both shapes
  // share the same payload schema once the JWT is decoded.
  private verifyAndNormalize(token: string): VerifiedCallback {
    const decoded = jwt.verify(token, this.creds.api_key, { algorithms: ['HS256'] }) as any
    const data = decoded?.data ?? {}
    const externalRef = data.merchantReferenceId || data.externalReferenceId
    const gatewayTxId = data.transactionId
    if (!externalRef || !gatewayTxId) {
      throw new Error('ZainCash JWT payload missing merchantReferenceId or transactionId')
    }
    return {
      externalRef,
      gatewayTxId,
      status: mapStatus(data.currentStatus || data.status),
      raw: decoded,
    }
  }

  async verifyRedirect(query: URLSearchParams): Promise<VerifiedCallback> {
    const token = query.get('token')
    if (!token) throw new Error('ZainCash redirect missing ?token=')
    return this.verifyAndNormalize(token)
  }

  async verifyWebhook(body: unknown): Promise<VerifiedCallback> {
    const token = (body as any)?.webhook_token
    if (!token) throw new Error('ZainCash webhook missing webhook_token')
    return this.verifyAndNormalize(token)
  }
}
