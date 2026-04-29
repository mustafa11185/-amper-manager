/**
 * Plan downgrade safety check.
 *
 * Returns issues that would arise if a tenant moved from current plan to target plan.
 * Used by:
 *   - manager-app /api/billing/checkout (block downgrade if exceeds limits)
 *   - manager-app billing UI (warn before submit)
 *   - company-admin extend/refund actions (informational)
 */
import { prisma } from '@/lib/prisma';

export interface DowngradeIssue {
  type: 'generators_exceeded' | 'subscribers_exceeded' | 'staff_exceeded' | 'feature_lost';
  message_ar: string;
  current: number;
  limit: number;
  delta: number;
}

export interface DowngradeCheck {
  ok: boolean;
  issues: DowngradeIssue[];
  current_usage: {
    generators: number;
    subscribers: number;
    staff: number;
  };
}

const FEATURE_DOWNGRADE_MESSAGES: Record<string, string> = {
  has_iot: 'مراقبة IoT (DSE 5110) ستتعطّل',
  has_ai: 'مساعد AI + التقارير الذكية ستتعطّل',
  has_subscriber_app: 'تطبيق المشترك سيتعطّل',
  has_api: 'الوصول للـ API سيتعطّل',
  has_multi_branch: 'الفروع المتعددة ستُدمج (احتفظ بالفرع الرئيسي فقط)',
  has_priority_support: 'دعم الأولوية سيتحوّل لدعم عادي',
};

/**
 * Run safety checks. `targetPlanId` may equal `currentPlanId` for renewal-without-change.
 */
export async function checkPlanDowngrade(
  tenantId: string,
  currentPlanId: string,
  targetPlanId: string,
): Promise<DowngradeCheck> {
  const [target, current, gens, subs, staff] = await Promise.all([
    prisma.plan.findUnique({ where: { id: targetPlanId } }),
    prisma.plan.findUnique({ where: { id: currentPlanId } }),
    prisma.generator.count({ where: { branch: { tenant_id: tenantId } } }).catch(() => 0),
    prisma.subscriber.count({ where: { tenant_id: tenantId } }).catch(() => 0),
    prisma.staff.count({ where: { tenant_id: tenantId } }).catch(() => 0),
  ]);

  const issues: DowngradeIssue[] = [];
  if (!target) {
    return { ok: false, issues: [], current_usage: { generators: gens, subscribers: subs, staff } };
  }

  // Limit checks (-1 = unlimited so always passes)
  if (target.generator_limit !== -1 && gens > target.generator_limit) {
    issues.push({
      type: 'generators_exceeded',
      message_ar: `لديك ${gens} مولدة. الباقة الجديدة تسمح بـ ${target.generator_limit} فقط.`,
      current: gens,
      limit: target.generator_limit,
      delta: gens - target.generator_limit,
    });
  }
  if (target.subscriber_limit !== -1 && subs > target.subscriber_limit) {
    issues.push({
      type: 'subscribers_exceeded',
      message_ar: `لديك ${subs} مشترك. الباقة الجديدة تسمح بـ ${target.subscriber_limit} فقط.`,
      current: subs,
      limit: target.subscriber_limit,
      delta: subs - target.subscriber_limit,
    });
  }
  if (target.staff_limit !== -1 && staff > target.staff_limit) {
    issues.push({
      type: 'staff_exceeded',
      message_ar: `لديك ${staff} موظف. الباقة الجديدة تسمح بـ ${target.staff_limit} فقط.`,
      current: staff,
      limit: target.staff_limit,
      delta: staff - target.staff_limit,
    });
  }

  // Feature loss check (current has, target doesn't)
  if (current) {
    const featureKeys = ['has_iot', 'has_ai', 'has_subscriber_app', 'has_api', 'has_multi_branch', 'has_priority_support'] as const;
    for (const k of featureKeys) {
      if (current[k] && !target[k]) {
        issues.push({
          type: 'feature_lost',
          message_ar: FEATURE_DOWNGRADE_MESSAGES[k] || `ميزة "${k}" ستتعطّل`,
          current: 1, limit: 0, delta: 1,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    current_usage: { generators: gens, subscribers: subs, staff },
  };
}
