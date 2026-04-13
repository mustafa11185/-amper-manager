// Canonical plan helper — one place to map legacy plan names and
// answer "does this plan unlock feature X?". Without this, every
// UI site rolled its own `plan === 'gold'` check and silently
// broke when the company-admin panel started writing the new
// canonical names (pro, business, corporate) instead of the old
// ones (basic, gold).
//
// Legacy → Canonical mapping:
//   trial  → starter     (free)
//   basic  → pro         (entry paid)
//   gold   → business    (mid tier, "ذهبي")
//   fleet  → fleet       (top)
//   custom → custom
//
// Feature tiers:
//   starter  — limited
//   pro      — entry-paid (reports, online payment)
//   business — mid tier ("gold features" in legacy code)
//   corporate — business + higher limits
//   fleet    — unlimited + white label
//   custom   — everything

export type PlanKey =
  | 'starter' | 'pro' | 'business' | 'corporate' | 'fleet' | 'custom'
  // Legacy values still present in old rows:
  | 'trial' | 'basic' | 'gold'

const LEGACY_MAP: Record<string, PlanKey> = {
  trial: 'starter',
  basic: 'pro',
  gold: 'business',
}

/** Normalize any plan value to the canonical new name. */
export function normalizePlan(raw: string | null | undefined): PlanKey {
  const k = (raw ?? 'starter').toLowerCase()
  return (LEGACY_MAP[k] ?? k) as PlanKey
}

/** Arabic display label for the plan badge. */
export function planLabelAr(raw: string | null | undefined): string {
  const p = normalizePlan(raw)
  switch (p) {
    case 'starter': return 'أساسي'
    case 'pro': return 'برو'
    case 'business': return 'أعمال'
    case 'corporate': return 'شركات'
    case 'fleet': return 'فليت'
    case 'custom': return 'مخصص'
    default: return 'أساسي'
  }
}

// ─── Feature tier checks ──────────────────────────────────────
// Each function is true when the plan is AT OR ABOVE the named tier.

/** Paid tier — anything that costs money (pro and up). */
export function isPaid(raw: string | null | undefined): boolean {
  const p = normalizePlan(raw)
  return p !== 'starter'
}

/**
 * "Gold"-tier features — business and above. This is the
 * historical check that every `plan === 'gold'` site was using.
 */
export function isGoldOrHigher(raw: string | null | undefined): boolean {
  const p = normalizePlan(raw)
  return p === 'business' || p === 'corporate' || p === 'fleet' || p === 'custom'
}

/** Fleet-tier features (multi-branch, white label, etc.) */
export function isFleetOrHigher(raw: string | null | undefined): boolean {
  const p = normalizePlan(raw)
  return p === 'fleet' || p === 'custom' || p === 'corporate'
}
