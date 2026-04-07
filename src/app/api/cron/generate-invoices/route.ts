import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const today = new Date();
  const dayOfMonth = today.getDate();
  console.log(`Cron generate-invoices running: day=${dayOfMonth}`);

  // Get all branches with active pricing
  const allPricing = await prisma.monthlyPricing.findMany({
    orderBy: { effective_from: "desc" },
    include: { branch: true },
  });

  // Deduplicate: latest pricing per branch
  const pricingByBranch = new Map<string, any>();
  for (const p of allPricing) {
    if (!pricingByBranch.has(p.branch_id)) {
      pricingByBranch.set(p.branch_id, p);
    }
  }

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const [branchId, pricing] of pricingByBranch) {
    const invoiceDay = (pricing as any).auto_invoice_day ?? 1;

    // Handle day > last day of month (e.g. 31 in February → run on last day)
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(invoiceDay, lastDayOfMonth);
    console.log(`  Branch ${branchId}: configured_day=${invoiceDay}, target=${targetDay}, today=${dayOfMonth}`);
    if (dayOfMonth !== targetDay) continue;

    const billingMonth = new Date().getMonth() + 1;
    const billingYear = new Date().getFullYear();
    const priceNormal = Number(pricing.price_per_amp_normal);
    const priceGold = Number(pricing.price_per_amp_gold);

    if (priceNormal <= 0 || priceGold <= 0) {
      console.log(`  Skipping branch ${branchId}: prices are 0`);
      continue;
    }

    // Get active subscribers for this branch
    const subscribers = await prisma.subscriber.findMany({
      where: { branch_id: branchId, is_active: true },
    });

    for (const sub of subscribers) {
      // Check if invoice already exists for this period
      const existing = await prisma.invoice.findFirst({
        where: {
          subscriber_id: sub.id,
          billing_month: billingMonth,
          billing_year: billingYear,
        },
      });

      if (existing) {
        totalSkipped++;
        continue;
      }

      const pricePerAmp =
        sub.subscription_type === "gold" ? priceGold : priceNormal;
      const totalDue = Math.round(Number(sub.amperage) * pricePerAmp);

      await prisma.$transaction(async (tx) => {
        // Check for old unpaid invoices → add to debt
        const unpaid = await tx.invoice.findMany({
          where: {
            subscriber_id: sub.id,
            is_fully_paid: false,
          },
        });

        let addToDebt = 0;
        for (const inv of unpaid) {
          const remaining =
            Number(inv.total_amount_due) - Number(inv.amount_paid);
          if (remaining > 0) addToDebt += remaining;
        }

        if (addToDebt > 0) {
          await tx.subscriber.update({
            where: { id: sub.id },
            data: {
              total_debt: Number(sub.total_debt) + addToDebt,
            },
          });

          // Mark old unpaid as "rolled to debt"
          for (const inv of unpaid) {
            await tx.invoice.update({
              where: { id: inv.id },
              data: { is_fully_paid: true, payment_method: "rolled_to_debt" },
            });
          }
        }

        // Create new invoice
        await tx.invoice.create({
          data: {
            subscriber_id: sub.id,
            branch_id: branchId,
            tenant_id: sub.tenant_id,
            billing_month: billingMonth,
            billing_year: billingYear,
            base_amount: totalDue,
            total_amount_due: totalDue,
            amount_paid: 0,
            is_fully_paid: false,
          },
        });
      });

      totalCreated++;
    }
  }

  return NextResponse.json({
    ok: true,
    day: dayOfMonth,
    invoices_created: totalCreated,
    invoices_skipped: totalSkipped,
  });
}
