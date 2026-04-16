import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Find expired pending discount requests
  const expiredRequests = await prisma.collectorDiscountRequest.findMany({
    where: {
      status: "pending",
      expires_at: { lt: new Date() },
    },
    include: {
      subscriber: true,
      staff: { select: { name: true } },
    },
  });

  let approved = 0;

  for (const req of expiredRequests) {
    const amount = Number(req.amount);

    // 1. Create SubscriberDiscount
    const discount = await prisma.subscriberDiscount.create({
      data: {
        subscriber_id: req.subscriber_id,
        branch_id: req.branch_id,
        tenant_id: req.tenant_id,
        discount_type: "fixed",
        discount_value: amount,
        reason: "موافقة تلقائية",
        is_active: true,
        applied_by: "system_timeout",
      },
    });

    // 2. Update Invoice if linked
    if (req.invoice_id) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.invoice_id },
      });

      if (invoice) {
        const currentDiscount = Number(invoice.discount_amount);
        const currentTotal = Number(invoice.total_amount_due);
        const newDiscount = currentDiscount + amount;
        const newTotal = Math.max(0, currentTotal - amount);

        await prisma.invoice.update({
          where: { id: req.invoice_id },
          data: {
            discount_amount: newDiscount,
            total_amount_due: newTotal,
            discount_type: "fixed",
            discount_value: amount,
            discount_reason: "موافقة تلقائية — انتهاء المهلة",
          },
        });
      }
    }

    // 3. Update request status
    await prisma.collectorDiscountRequest.update({
      where: { id: req.id },
      data: {
        status: "timeout_approved",
        decided_at: new Date(),
        decision_note: "موافقة تلقائية — لم يرد المالك",
        discount_id: discount.id,
      },
    });

    // 4. Notification to collector
    await prisma.notification.create({
      data: {
        branch_id: req.branch_id,
        tenant_id: req.tenant_id,
        type: "discount_approved",
        body: `✅ موافقة تلقائية — الخصم طُبِّق`,
        is_read: false,
        payload: {
          discount_request_id: req.id,
          staff_id: req.staff_id,
          amount,
          target: "collector",
        },
      },
    });

    // 5. Notification to owner
    const diffMin = Math.round(
      (new Date().getTime() - req.created_at.getTime()) / 60000
    );
    await prisma.notification.create({
      data: {
        branch_id: req.branch_id,
        tenant_id: req.tenant_id,
        type: "discount_timeout",
        body: `⚠️ خصم ${amount} د.ع لـ ${req.subscriber.name} طُبِّق تلقائياً (لم ترد في ${diffMin} دقيقة)`,
        is_read: false,
        payload: {
          discount_request_id: req.id,
          subscriber_id: req.subscriber_id,
          amount,
          minutes_waited: diffMin,
          target: "owner",
        },
      },
    });

    approved++;
  }

  return NextResponse.json({
    ok: true,
    expired_processed: approved,
  });
}
