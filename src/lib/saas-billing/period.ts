/**
 * Pricing helpers for multi-period subscriptions.
 *
 * Business rule (from user):
 *   - First-time subscription = monthly (1 period only — locked)
 *   - Renewals = user can choose 1, 3, 6, or 12 months
 */

import type { Plan } from '@prisma/client';

export type PeriodMonths = 1 | 3 | 6 | 12;

export const ALL_PERIODS: PeriodMonths[] = [1, 3, 6, 12];

/**
 * Returns the IQD amount to charge for a given (plan, period).
 */
export function priceForPeriod(plan: Plan, months: PeriodMonths): number {
  switch (months) {
    case 1:
      return plan.price_monthly;
    case 3:
      return plan.price_3m;
    case 6:
      return plan.price_6m;
    case 12:
      return plan.price_12m;
  }
}

/**
 * Returns the % discount vs raw monthly × N for transparency in UI.
 * E.g. plan.price_monthly=35K, plan.price_12m=350K → savings 17%
 */
export function savingsPercent(plan: Plan, months: PeriodMonths): number {
  if (months === 1) return 0;
  const rawTotal = plan.price_monthly * months;
  const actual = priceForPeriod(plan, months);
  if (rawTotal <= 0) return 0;
  return Math.round(((rawTotal - actual) / rawTotal) * 100);
}

/**
 * For first-time subscribers, only monthly is allowed.
 * For renewals (has_used_trial=true OR has prior payments), any period is OK.
 */
export function allowedPeriods(opts: {
  isFirstSubscription: boolean;
}): PeriodMonths[] {
  return opts.isFirstSubscription ? [1] : ALL_PERIODS;
}

/**
 * Compute the new currentPeriodEnd given a starting date and period.
 * Naive month addition — works for all our use cases (no overflow in 1/3/6/12).
 */
export function computePeriodEnd(start: Date, months: PeriodMonths): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

/**
 * Generate a human-readable invoice number: INV-2026-04-001
 * (year-month-sequence). The sequence portion comes from caller.
 */
export function formatInvoiceNumber(seq: number, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const s = String(seq).padStart(3, '0');
  return `INV-${y}-${m}-${s}`;
}
