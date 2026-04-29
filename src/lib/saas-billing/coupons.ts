/**
 * Coupon validation + application.
 *
 * Used at:
 *   - manager-app /api/billing/checkout (apply coupon to invoice)
 *   - manager-app /api/billing/redeem-coupon (preview before checkout)
 */
import { prisma } from '@/lib/prisma';

export interface CouponPreview {
  ok: boolean;
  reason?: 'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'PLAN_NOT_ELIGIBLE' | 'BELOW_MIN_AMOUNT';
  coupon_id?: string;
  description?: string | null;
  discount_amount?: number; // IQD
  final_amount?: number;    // IQD after discount
}

export async function previewCoupon(opts: {
  code: string;
  planId: string;
  baseAmount: number;
}): Promise<CouponPreview> {
  const code = opts.code.trim().toUpperCase();
  if (!code) return { ok: false, reason: 'NOT_FOUND' };

  const coupon = await prisma.saasCoupon.findUnique({
    where: { code },
  });
  if (!coupon) return { ok: false, reason: 'NOT_FOUND' };
  if (!coupon.is_active) return { ok: false, reason: 'INACTIVE' };
  if (coupon.expires_at && coupon.expires_at < new Date()) return { ok: false, reason: 'EXPIRED' };
  if (coupon.max_redemptions > 0 && coupon.redeemed_count >= coupon.max_redemptions) {
    return { ok: false, reason: 'EXHAUSTED' };
  }
  if (coupon.applicable_plans.length > 0 && !coupon.applicable_plans.includes(opts.planId)) {
    return { ok: false, reason: 'PLAN_NOT_ELIGIBLE' };
  }
  if (coupon.min_amount > 0 && opts.baseAmount < coupon.min_amount) {
    return { ok: false, reason: 'BELOW_MIN_AMOUNT' };
  }

  let discount: number;
  if (coupon.type === 'percent') {
    discount = Math.round((opts.baseAmount * coupon.amount) / 100);
  } else {
    discount = coupon.amount;
  }
  // Cap at base amount — never make invoice negative
  discount = Math.min(discount, opts.baseAmount);

  return {
    ok: true,
    coupon_id: coupon.id,
    description: coupon.description,
    discount_amount: discount,
    final_amount: opts.baseAmount - discount,
  };
}

/**
 * Atomically increment redemption counter + create audit row.
 * Caller must already have validated the coupon via previewCoupon.
 * Returns false if the coupon was exhausted between preview and apply.
 */
export async function redeemCoupon(opts: {
  couponId: string;
  tenantId: string;
  invoiceId?: string;
  discountAmount: number;
}): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      // Re-check exhaustion under transaction
      const c = await tx.saasCoupon.findUnique({ where: { id: opts.couponId } });
      if (!c || !c.is_active) throw new Error('coupon_invalid');
      if (c.max_redemptions > 0 && c.redeemed_count >= c.max_redemptions) {
        throw new Error('coupon_exhausted');
      }

      await tx.saasCoupon.update({
        where: { id: opts.couponId },
        data: { redeemed_count: { increment: 1 } },
      });
      await tx.saasCouponRedemption.create({
        data: {
          coupon_id: opts.couponId,
          tenant_id: opts.tenantId,
          invoice_id: opts.invoiceId,
          discount_amount: opts.discountAmount,
        },
      });
    });
    return true;
  } catch {
    return false;
  }
}
