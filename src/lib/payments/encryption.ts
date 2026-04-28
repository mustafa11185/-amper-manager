// AES-256-GCM symmetric encryption for per-tenant payment-gateway credentials.
//
// Storage format (single base64 string in DB column `encrypted_credentials`):
//   base64( IV[12] || CIPHERTEXT || AUTH_TAG[16] )
//
// We don't store the plaintext shape in the DB — each gateway adapter knows the
// JSON schema of its own credentials. Key rotation is destructive (invalidates
// every stored row); rotate by force-rekeying tenants offline if ever needed.

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const hex = process.env.PAYMENTS_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('PAYMENTS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Set it in .env')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptCredentials(plaintext: object): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const json = Buffer.from(JSON.stringify(plaintext), 'utf8')
  const ct = Buffer.concat([cipher.update(json), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString('base64')
}

export function decryptCredentials<T = Record<string, unknown>>(blob: string): T {
  const key = getKey()
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('encrypted_credentials blob is too short / malformed')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return JSON.parse(pt.toString('utf8')) as T
}

// Rotate one row by re-encrypting under (potentially new) key. Used when a
// tenant updates a single field — we round-trip through plaintext so a partial
// update doesn't drop fields the caller didn't specify.
export function reencryptWithMerge(blob: string, patch: Record<string, unknown>): string {
  const current = decryptCredentials<Record<string, unknown>>(blob)
  return encryptCredentials({ ...current, ...patch })
}
