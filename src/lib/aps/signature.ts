// Signature handling for APS Fawateer-E messages.
//
// NOTE: The exact signature algorithm is NOT specified in spec v1.7.
// We need APS to confirm — likely one of:
//   1. HMAC-SHA256 of canonical XML body with shared secret
//   2. RSA signature with biller's private key
//   3. Simple shared API key in HTTP header
//
// For now we provide stubs + a switch we can flip once we know.
// In sandbox mode (no APS_SHARED_SECRET set), validation is skipped.

import crypto from 'crypto'

const SHARED_SECRET = process.env.APS_SHARED_SECRET ?? ''
const BILLER_CODE = process.env.APS_BILLER_CODE ?? ''

export function isApsConfigured(): boolean {
  return !!SHARED_SECRET && !!BILLER_CODE
}

export function getBillerCode(): string {
  return BILLER_CODE
}

/**
 * Verify the signature on an incoming APS message.
 * Returns true if valid OR if validation is bypassed (sandbox mode).
 */
export function verifySignature(rawXml: string, providedSignature: string | undefined): boolean {
  if (!SHARED_SECRET) {
    // Sandbox mode — log warning but accept
    console.warn('[APS] APS_SHARED_SECRET not set — signature validation skipped (sandbox mode)')
    return true
  }
  if (!providedSignature) return false
  const expected = signMessage(rawXml)
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )
  } catch {
    return false
  }
}

/** Sign an outgoing message body. Used for our responses. */
export function signMessage(body: string): string {
  if (!SHARED_SECRET) return ''
  return crypto
    .createHmac('sha256', SHARED_SECRET)
    .update(body, 'utf8')
    .digest('hex')
}
