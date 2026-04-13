// Central source of truth for "the current billing cycle".
//
// A billing cycle is the time window between two consecutive
// invoice generations. Every dashboard widget, staff stat, salary
// calculation, and collection-progress bar that claims to show
// "this month" should actually show "this cycle".
//
// Model:
//
//   cycle_start = generated_at of the latest non-reversed
//                 InvoiceGenerationLog for the branch
//   cycle_end   = now (open window)
//
//   billing_month / billing_year come from the same log so
//   invoice-scoped queries (e.g. "how many invoices for this
//   cycle") stay consistent with payment-scoped queries (e.g.
//   "how much collected this cycle").
//
// Any event (Payment, DeliveryRecord, SalaryPayment, CheckIn, ...)
// whose `created_at` or `paid_at` ≥ cycle_start belongs to the
// current cycle — regardless of which month it targets. This is
// option (أ) from the cycle-vs-calendar discussion: late payments
// for old invoices count toward the current cycle's revenue,
// because that's the revenue the owner actually received this
// cycle.
//
// Fallback: when no generation log exists (brand-new branch), we
// fall back to the start of the current calendar month so widgets
// never show "no data" on day 1.

import { prisma } from './prisma'

export type CycleWindow = {
  /** Start of the current cycle (invoice generation time). */
  start: Date
  /** Billing period this cycle belongs to. */
  month: number
  year: number
  /** Source of the period — log or calendar fallback. */
  source: 'log' | 'calendar'
  /** The log that defines this cycle (null when fallback). */
  logId: string | null
}

export async function getCurrentCycleWindow(
  branchId: string,
): Promise<CycleWindow> {
  try {
    const log = await prisma.invoiceGenerationLog.findFirst({
      where: { branch_id: branchId, is_reversed: false },
      orderBy: { generated_at: 'desc' },
      select: {
        id: true,
        generated_at: true,
        billing_month: true,
        billing_year: true,
      },
    })
    if (log) {
      return {
        start: log.generated_at,
        month: log.billing_month,
        year: log.billing_year,
        source: 'log',
        logId: log.id,
      }
    }
  } catch {
    // fall through to calendar fallback
  }

  // Brand-new branch with no generation yet — use calendar month.
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    start,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    source: 'calendar',
    logId: null,
  }
}

/**
 * Previous cycle — the window between the 2nd-latest generation
 * and the latest one. Used for "last month" comparisons on staff
 * stats, manager dashboards, etc. Falls back to the previous
 * calendar month if there aren't two generations yet.
 */
export async function getPreviousCycleWindow(
  branchId: string,
): Promise<{ start: Date; end: Date; month: number; year: number }> {
  try {
    const logs = await prisma.invoiceGenerationLog.findMany({
      where: { branch_id: branchId, is_reversed: false },
      orderBy: { generated_at: 'desc' },
      take: 2,
      select: { generated_at: true, billing_month: true, billing_year: true },
    })
    if (logs.length === 2) {
      return {
        start: logs[1].generated_at,
        end: logs[0].generated_at,
        month: logs[1].billing_month,
        year: logs[1].billing_year,
      }
    }
  } catch {}
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    start,
    end,
    month: start.getMonth() + 1,
    year: start.getFullYear(),
  }
}

/**
 * Tenant-scoped version — when you only have a tenantId and need
 * the cycle of any branch in the tenant. Uses the most recent
 * generation across all branches.
 */
export async function getCurrentCycleWindowByTenant(
  tenantId: string,
): Promise<CycleWindow> {
  try {
    const log = await prisma.invoiceGenerationLog.findFirst({
      where: { tenant_id: tenantId, is_reversed: false },
      orderBy: { generated_at: 'desc' },
      select: {
        id: true,
        generated_at: true,
        billing_month: true,
        billing_year: true,
      },
    })
    if (log) {
      return {
        start: log.generated_at,
        month: log.billing_month,
        year: log.billing_year,
        source: 'log',
        logId: log.id,
      }
    }
  } catch {}

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    start,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    source: 'calendar',
    logId: null,
  }
}
