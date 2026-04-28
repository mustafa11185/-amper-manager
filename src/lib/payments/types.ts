// Common contract every payment-gateway adapter must satisfy. Keeps caller
// code (Subscriber-app checkout, webhook router) gateway-agnostic.

export type GatewayName = 'zaincash' | 'qi' | 'asiapay'

export type PaymentStatus =
  | 'pending'    // created, awaiting customer action
  | 'success'    // paid, funds will/did settle
  | 'failed'     // customer cancelled or gateway rejected
  | 'expired'    // session timed out
  | 'refunded'   // reversed after success
  | 'unknown'    // gateway returned a state we don't model

export interface InitiateInput {
  // Stable id we generate on our side; gateways accept it as their idempotency
  // key (ZainCash externalReferenceId, AsiaPay merchantReference, ...).
  externalRef: string
  // Our internal order id (invoice id or similar). Surfaces in gateway dashboard
  // so the merchant can reconcile.
  orderId: string
  amountIqd: number
  customerPhone?: string  // E.164 without +, e.g. "9647801234567"
  successUrl: string
  failureUrl: string
  language?: 'en' | 'ar' | 'ku'
  // Free-form description/service identifier required by some gateways
  serviceType?: string
}

export interface InitiateResult {
  // URL to redirect the customer to. Caller MUST NOT manipulate this.
  redirectUrl: string
  // The gateway-side transaction id — store it; we'll need it for inquiry/reverse.
  gatewayTxId: string
  expiresAt?: Date
  raw: unknown
}

export interface InquiryResult {
  status: PaymentStatus
  amountIqd: number
  feeIqd?: number
  gatewayTxId: string
  completedAt?: Date
  raw: unknown
}

export interface ReverseResult {
  ok: boolean
  raw: unknown
}

// Normalized result of verifying a redirect/webhook from any gateway.
// Adapter is responsible for extracting both fields from gateway-specific
// shapes (JWT body vs. plain payment object) and mapping the status code
// into our PaymentStatus enum.
export interface VerifiedCallback {
  // Our externalRef (matches `externalReferenceId` we sent at initiate time).
  externalRef: string
  gatewayTxId: string
  status: PaymentStatus
  raw: unknown
}

export interface PaymentGateway {
  readonly name: GatewayName
  initiate(input: InitiateInput): Promise<InitiateResult>
  inquire(gatewayTxId: string): Promise<InquiryResult>
  reverse(gatewayTxId: string, reason: string): Promise<ReverseResult>
  // Verify a customer-redirect callback. Some gateways (ZainCash) put a JWT
  // in `?token=...`; others (Qi) put just `?paymentId=...` and the adapter
  // calls inquire() to fetch the authoritative status.
  verifyRedirect(query: URLSearchParams): Promise<VerifiedCallback>
  // Verify a server-to-server webhook body. ZainCash wraps a JWT in
  // `{ webhook_token }`; Qi sends the payment object directly.
  verifyWebhook(body: unknown): Promise<VerifiedCallback>
  // Cheap connectivity probe — the owner UI calls this after saving creds
  // so they see "✓ الاتصال ناجح" or "✗ خطأ في كذا" before going live.
  // Implementations should NOT create a transaction; they should hit an
  // auth-only endpoint (OAuth2 token, etc.). Throw on auth failure.
  testConnection(): Promise<{ ok: true }>
}

// Per-gateway credential shapes. Stored encrypted as a single JSON blob; each
// adapter casts to its own shape. Adding a gateway = adding a shape here.

export interface ZainCashCredentials {
  client_id: string
  client_secret: string
  api_key: string         // for verifying redirect/webhook JWTs (HS256)
  msisdn?: string         // merchant phone (for support / display)
  service_type: string    // e.g., "JAWS" — assigned by ZainCash to merchant
  base_url?: string       // override; defaults to UAT/prod based on is_test_mode
}

export interface QiCredentials {
  // Basic-Auth credentials issued by QiCard's onboarding team.
  username: string
  password: string
  // X-Terminal-Id header — identifies which merchant terminal this request
  // is for. A single QiCard merchant may have multiple terminals.
  terminal_id: string
  base_url?: string  // override; defaults to UAT/prod based on is_test_mode
}

export interface AsiaPayCredentials {
  app_id: string
  app_key: string
  app_secret: string
  private_key: string
  merchant_code: string
  domain_url: string
}

export type GatewayCredentialsByName = {
  zaincash: ZainCashCredentials
  qi: QiCredentials
  asiapay: AsiaPayCredentials
}
