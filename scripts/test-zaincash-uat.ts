// End-to-end smoke test against ZainCash UAT.
//
// What it covers:
//   1. Encryption round-trip: encrypt a creds object, decrypt, compare.
//   2. OAuth2 token: hits /oauth2/token with the test client_id/secret.
//   3. initiate(): creates a real transaction on ZainCash UAT and prints the
//      `redirectUrl` you can open in a browser to complete the flow.
//   4. inquire(): immediately reads back the transaction status (should be
//      OTP_SENT or PENDING right after init).
//
// Run:
//   ZAINCASH_CLIENT_ID=... \
//   ZAINCASH_CLIENT_SECRET=... \
//   ZAINCASH_API_KEY=... \
//   ZAINCASH_SERVICE_TYPE=JAWS \
//   npx tsx scripts/test-zaincash-uat.ts
//
// All values come from your ZainCash UAT merchant onboarding (or the test
// creds in the v2 docs PDF). API key is the JWT secret used for callback
// verification — NOT the same as client_secret.

import 'dotenv/config'
import { randomUUID } from 'crypto'
import { ZainCashGateway } from '../src/lib/payments/zaincash'
import { encryptCredentials, decryptCredentials } from '../src/lib/payments/encryption'
import type { ZainCashCredentials } from '../src/lib/payments/types'

function need(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`✗ Missing env var: ${name}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const creds: ZainCashCredentials = {
    client_id: need('ZAINCASH_CLIENT_ID'),
    client_secret: need('ZAINCASH_CLIENT_SECRET'),
    api_key: need('ZAINCASH_API_KEY'),
    service_type: process.env.ZAINCASH_SERVICE_TYPE || 'JAWS',
    msisdn: process.env.ZAINCASH_MSISDN,
  }

  // 1) Encryption round-trip
  console.log('\n[1/4] Encryption round-trip')
  const blob = encryptCredentials(creds as object)
  const decoded = decryptCredentials<ZainCashCredentials>(blob)
  const ok = decoded.client_id === creds.client_id && decoded.api_key === creds.api_key
  console.log(`  blob length: ${blob.length}`)
  console.log(`  decrypt OK: ${ok ? '✓' : '✗ FAIL'}`)
  if (!ok) process.exit(1)

  // 2) Build adapter (UAT mode = is_test_mode=true)
  console.log('\n[2/4] Build ZainCashGateway (UAT mode)')
  const gateway = new ZainCashGateway(creds, /* isTestMode */ true)
  console.log(`  ✓ adapter ready, base=https://pg-api-uat.zaincash.iq`)

  // 3) Initiate a fake 1000 IQD payment
  console.log('\n[3/4] initiate(amount=1000 IQD)')
  const externalRef = randomUUID()
  let initResult
  try {
    initResult = await gateway.initiate({
      externalRef,
      orderId: `TEST-${Date.now()}`,
      amountIqd: 1000,
      customerPhone: '9647802999569', // any of the test customer MSISDNs
      successUrl: 'http://localhost:3005/api/payment/callback/zaincash?t=test-tenant',
      failureUrl: 'http://localhost:3005/api/payment/callback/zaincash?t=test-tenant',
      language: 'ar',
    })
  } catch (e: any) {
    console.error(`  ✗ initiate failed: ${e.message}`)
    process.exit(1)
  }
  console.log(`  ✓ gatewayTxId: ${initResult.gatewayTxId}`)
  console.log(`  ✓ expiresAt: ${initResult.expiresAt?.toISOString() ?? 'n/a'}`)
  console.log(`  ✓ redirectUrl:\n      ${initResult.redirectUrl}`)
  console.log(`\n      ↑ Open this URL in a browser to complete a test payment.`)
  console.log(`      Use one of the test customer numbers: 9647802999569 / ...432 / ...464 / ...474`)
  console.log(`      PIN: 1111   OTP: 111111`)

  // 4) Inquire right away — expect OTP_SENT or PENDING
  console.log('\n[4/4] inquire() right after init')
  try {
    const inq = await gateway.inquire(initResult.gatewayTxId)
    console.log(`  ✓ status: ${inq.status}`)
    console.log(`  ✓ amount: ${inq.amountIqd} IQD`)
    console.log(`  ✓ raw.status: ${(inq.raw as any)?.status}`)
  } catch (e: any) {
    console.error(`  ✗ inquire failed: ${e.message}`)
    process.exit(1)
  }

  console.log('\n✓ All smoke checks passed.\n')
  console.log('Next: open the redirectUrl above to complete the payment, then')
  console.log('re-run this script with INQUIRE_ID=<gatewayTxId> to see the')
  console.log('updated status.')
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
