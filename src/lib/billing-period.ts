import { prisma } from './prisma'

/**
 * المصدر الوحيد الموثوق للشهر الفعلي لكل فرع.
 * الأولوية: آخر سجل إصدار → الشهر الحالي كـ fallback
 */
export async function getActiveBillingPeriod(branchId: string): Promise<{
  month: number
  year: number
  source: 'log' | 'calendar'
}> {
  try {
    const log = await prisma.invoiceGenerationLog.findFirst({
      where: { branch_id: branchId },
      orderBy: { generated_at: 'desc' },
      select: { billing_month: true, billing_year: true },
    })
    if (log?.billing_month && log?.billing_year) {
      return { month: log.billing_month, year: log.billing_year, source: 'log' }
    }
  } catch {}

  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear(), source: 'calendar' }
}

/**
 * لما عندك tenant_id بس (بدون branch_id)
 */
export async function getActiveBillingPeriodByTenant(tenantId: string): Promise<{
  month: number
  year: number
  source: 'log' | 'calendar'
}> {
  try {
    const log = await prisma.invoiceGenerationLog.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { generated_at: 'desc' },
      select: { billing_month: true, billing_year: true },
    })
    if (log?.billing_month && log?.billing_year) {
      return { month: log.billing_month, year: log.billing_year, source: 'log' }
    }
  } catch {}

  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear(), source: 'calendar' }
}
