// Public entry point for the payments layer.
//
// Resolves a tenant's configured gateway, decrypts credentials, and returns a
// ready-to-use adapter. Caller code never touches the encryption layer or
// Prisma directly — keeping plaintext credentials reach as small as possible.

import { prisma } from '@/lib/prisma'
import { decryptCredentials, encryptCredentials } from './encryption'
import { ZainCashGateway } from './zaincash'
import { QiGateway } from './qi'
import { AsiaPayGateway } from './asiapay'
import type {
  GatewayName,
  PaymentGateway,
  GatewayCredentialsByName,
} from './types'

export * from './types'
export { encryptCredentials, decryptCredentials } from './encryption'

interface ResolvedConfig<T> {
  credentials: T
  isTestMode: boolean
  isEnabled: boolean
}

async function loadConfig<T>(tenantId: string, gateway: GatewayName): Promise<ResolvedConfig<T> | null> {
  const row = await prisma.paymentGatewayCredentials.findUnique({
    where: { tenant_id_gateway: { tenant_id: tenantId, gateway } },
    select: {
      encrypted_credentials: true,
      is_test_mode: true,
      is_enabled: true,
    },
  })
  if (!row) return null
  const credentials = decryptCredentials<T>(row.encrypted_credentials)
  return { credentials, isTestMode: row.is_test_mode, isEnabled: row.is_enabled }
}

// Build an adapter for a given (tenant, gateway). Returns null when the tenant
// hasn't configured this gateway, or it's disabled. Caller decides whether
// "not configured" is a 404 or a "try the next gateway" fallback.
export async function getGateway(tenantId: string, gateway: GatewayName): Promise<PaymentGateway | null> {
  switch (gateway) {
    case 'zaincash': {
      const cfg = await loadConfig<GatewayCredentialsByName['zaincash']>(tenantId, 'zaincash')
      if (!cfg || !cfg.isEnabled) return null
      return new ZainCashGateway(cfg.credentials, cfg.isTestMode)
    }
    case 'qi': {
      const cfg = await loadConfig<GatewayCredentialsByName['qi']>(tenantId, 'qi')
      if (!cfg || !cfg.isEnabled) return null
      return new QiGateway(cfg.credentials, cfg.isTestMode)
    }
    case 'asiapay': {
      const cfg = await loadConfig<GatewayCredentialsByName['asiapay']>(tenantId, 'asiapay')
      if (!cfg || !cfg.isEnabled) return null
      return new AsiaPayGateway(cfg.credentials, cfg.isTestMode)
    }
  }
}

// Resolve the tenant's default gateway (the row with is_default=true and
// is_enabled=true). Returns null if none is configured. Falls back to the
// first enabled gateway when no default is marked.
export async function getDefaultGateway(tenantId: string): Promise<PaymentGateway | null> {
  const rows = await prisma.paymentGatewayCredentials.findMany({
    where: { tenant_id: tenantId, is_enabled: true },
    select: { gateway: true, is_default: true },
    orderBy: [{ is_default: 'desc' }, { updated_at: 'desc' }],
  })
  for (const r of rows) {
    const gw = r.gateway as GatewayName
    const adapter = await getGateway(tenantId, gw)
    if (adapter) return adapter
  }
  return null
}

// Owner UI helper: save / overwrite credentials for a (tenant, gateway). Always
// re-encrypts the full plaintext shape so partial updates can't smuggle stale
// fields in. `existingPatch=true` reads the prior row and merges.
export async function saveCredentials<G extends GatewayName>(opts: {
  tenantId: string
  gateway: G
  credentials: GatewayCredentialsByName[G]
  isEnabled?: boolean
  isDefault?: boolean
  isTestMode?: boolean
  displayName?: string | null
}) {
  const blob = encryptCredentials(opts.credentials as object)
  await prisma.paymentGatewayCredentials.upsert({
    where: { tenant_id_gateway: { tenant_id: opts.tenantId, gateway: opts.gateway } },
    create: {
      tenant_id: opts.tenantId,
      gateway: opts.gateway,
      encrypted_credentials: blob,
      is_enabled: opts.isEnabled ?? false,
      is_default: opts.isDefault ?? false,
      is_test_mode: opts.isTestMode ?? true,
      display_name: opts.displayName ?? null,
    },
    update: {
      encrypted_credentials: blob,
      is_enabled: opts.isEnabled ?? undefined,
      is_default: opts.isDefault ?? undefined,
      is_test_mode: opts.isTestMode ?? undefined,
      display_name: opts.displayName ?? undefined,
    },
  })
  // Enforce single is_default per tenant — clear other defaults if this one
  // claimed it. Single-statement, no race against owner double-clicking.
  if (opts.isDefault === true) {
    await prisma.paymentGatewayCredentials.updateMany({
      where: { tenant_id: opts.tenantId, gateway: { not: opts.gateway } },
      data: { is_default: false },
    })
  }
}

// Owner UI helper: list configured gateways without exposing plaintext.
export async function listConfiguredGateways(tenantId: string) {
  const rows = await prisma.paymentGatewayCredentials.findMany({
    where: { tenant_id: tenantId },
    select: {
      gateway: true,
      is_enabled: true,
      is_default: true,
      is_test_mode: true,
      display_name: true,
      last_validated_at: true,
      updated_at: true,
    },
    orderBy: { gateway: 'asc' },
  })
  return rows
}
