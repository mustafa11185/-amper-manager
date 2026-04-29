/**
 * SaaS-level gateway resolver.
 *
 * Distinct from `/lib/payments/index.ts#getGateway` which loads PER-TENANT
 * credentials. Here we load AMPER's master credentials with two-tier lookup:
 *
 *   1. DB row in `amper_gateway_credentials` (encrypted) — managed via
 *      company-admin /saas-billing/credentials UI. Lets non-developers
 *      rotate credentials without redeploy.
 *   2. Env vars (AMPER_*) — fallback for fresh installs / disaster recovery.
 *
 * If both are present, DB wins. If neither, throws a clear error.
 */
import { prisma } from '@/lib/prisma';
import { decryptCredentials } from '@/lib/payments/encryption';
import { ZainCashGateway } from '@/lib/payments/zaincash';
import { QiGateway } from '@/lib/payments/qi';
import { AsiaPayGateway } from '@/lib/payments/asiapay';
import type {
  PaymentGateway,
  GatewayName,
  ZainCashCredentials,
  QiCredentials,
  AsiaPayCredentials,
} from '@/lib/payments/types';

// DB enum is `zain_cash` etc. — lib uses `zaincash`. Map between them.
export type DbGateway = 'zain_cash' | 'qi_card' | 'asia_pay';

const DB_TO_LIB: Record<DbGateway, GatewayName> = {
  zain_cash: 'zaincash',
  qi_card: 'qi',
  asia_pay: 'asiapay',
};
const LIB_TO_DB: Record<GatewayName, DbGateway> = {
  zaincash: 'zain_cash',
  qi: 'qi_card',
  asiapay: 'asia_pay',
};

export function dbGatewayToLib(g: DbGateway): GatewayName { return DB_TO_LIB[g]; }
export function libGatewayToDb(g: GatewayName): DbGateway { return LIB_TO_DB[g]; }

function isTestMode(envName: string): boolean {
  const v = process.env[envName];
  return v === 'true' || v === '1';
}
function envOrUndef(name: string): string | undefined {
  return process.env[name] || undefined;
}

interface ResolvedCreds<T> {
  credentials: T;
  isTestMode: boolean;
  source: 'db' | 'env';
}

/**
 * Try DB first. If not found / disabled, fall back to env vars.
 */
async function resolveCreds(name: GatewayName): Promise<ResolvedCreds<unknown> | null> {
  // 1. DB lookup
  const row = await prisma.amperGatewayCredentials.findUnique({
    where: { gateway: libGatewayToDb(name) },
    select: { encrypted_credentials: true, is_test_mode: true, is_enabled: true },
  }).catch(() => null);

  if (row && row.is_enabled) {
    return {
      credentials: decryptCredentials(row.encrypted_credentials),
      isTestMode: row.is_test_mode,
      source: 'db',
    };
  }

  // 2. Env fallback
  return loadFromEnv(name);
}

function loadFromEnv(name: GatewayName): ResolvedCreds<unknown> | null {
  switch (name) {
    case 'zaincash': {
      const client_id = envOrUndef('AMPER_ZAINCASH_CLIENT_ID');
      if (!client_id) return null;
      return {
        credentials: {
          client_id,
          client_secret: process.env.AMPER_ZAINCASH_CLIENT_SECRET || '',
          api_key: process.env.AMPER_ZAINCASH_API_KEY || '',
          service_type: process.env.AMPER_ZAINCASH_SERVICE_TYPE || '',
          msisdn: envOrUndef('AMPER_ZAINCASH_MSISDN'),
        } as ZainCashCredentials,
        isTestMode: isTestMode('AMPER_ZAINCASH_TEST_MODE'),
        source: 'env',
      };
    }
    case 'qi': {
      const username = envOrUndef('AMPER_QI_USERNAME');
      if (!username) return null;
      return {
        credentials: {
          username,
          password: process.env.AMPER_QI_PASSWORD || '',
          terminal_id: process.env.AMPER_QI_TERMINAL_ID || '',
        } as QiCredentials,
        isTestMode: isTestMode('AMPER_QI_TEST_MODE'),
        source: 'env',
      };
    }
    case 'asiapay': {
      const app_id = envOrUndef('AMPER_ASIAPAY_APP_ID');
      if (!app_id) return null;
      return {
        credentials: {
          app_id,
          app_key: process.env.AMPER_ASIAPAY_APP_KEY || '',
          app_secret: process.env.AMPER_ASIAPAY_APP_SECRET || '',
          private_key: process.env.AMPER_ASIAPAY_PRIVATE_KEY || '',
          merchant_code: process.env.AMPER_ASIAPAY_MERCHANT_CODE || '',
          domain_url: process.env.AMPER_ASIAPAY_DOMAIN_URL || '',
        } as AsiaPayCredentials,
        isTestMode: isTestMode('AMPER_ASIAPAY_TEST_MODE'),
        source: 'env',
      };
    }
  }
}

/**
 * Build a PaymentGateway adapter using Amper's master credentials (DB > env).
 * Throws clear error if neither source has credentials.
 */
export async function getAmperGateway(name: GatewayName): Promise<PaymentGateway> {
  const cfg = await resolveCreds(name);
  if (!cfg) {
    throw new Error(
      `[saas-billing] No credentials configured for gateway "${name}". ` +
      `Set AMPER_${name.toUpperCase()}_* env vars or save via /saas-billing/credentials.`,
    );
  }

  switch (name) {
    case 'zaincash':
      return new ZainCashGateway(cfg.credentials as ZainCashCredentials, cfg.isTestMode);
    case 'qi':
      return new QiGateway(cfg.credentials as QiCredentials, cfg.isTestMode);
    case 'asiapay':
      return new AsiaPayGateway(cfg.credentials as AsiaPayCredentials, cfg.isTestMode);
  }
}

/**
 * Returns which gateways have configured credentials AND which source was used.
 * Powers the pricing-page payment-method selector.
 */
export async function listConfiguredAmperGateways(): Promise<
  Array<{ name: GatewayName; source: 'db' | 'env' }>
> {
  const out: Array<{ name: GatewayName; source: 'db' | 'env' }> = [];
  for (const n of ['zaincash', 'qi', 'asiapay'] as GatewayName[]) {
    const cfg = await resolveCreds(n);
    if (cfg) out.push({ name: n, source: cfg.source });
  }
  return out;
}
