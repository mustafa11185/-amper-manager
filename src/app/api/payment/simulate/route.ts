import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const subscriberId = cookieStore.get("subscriber_id")?.value;
    if (!subscriberId) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      include: { branch: true },
    });
    if (!subscriber) return NextResponse.json({ error: "مشترك غير موجود" }, { status: 404 });

    const branch = subscriber.branch;

    // Only allow simulation when no real gateway is configured. We block
    // simulate if the tenant has ANY enabled PaymentGatewayCredentials row
    // — there's a real gateway, run real flow.
    if (branch.is_online_payment_enabled) {
      const realGateway = await prisma.paymentGatewayCredentials.findFirst({
        where: { tenant_id: subscriber.tenant_id, is_enabled: true },
        select: { gateway: true },
      });
      if (realGateway) {
        return NextResponse.json({ error: "الدفع الإلكتروني مفعّل — استخدم الدفع الحقيقي" }, { status: 400 });
      }
    }

    // Find current unpaid invoice
    const pricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: branch.id },
      orderBy: { effective_from: "desc" },
    });

    const now = new Date();
    const billingMonth = pricing ? new Date(pricing.effective_from).getMonth() + 1 : now.getMonth() + 1;
    const billingYear = pricing ? new Date(pricing.effective_from).getFullYear() : now.getFullYear();

    const invoice = await prisma.invoice.findFirst({
      where: {
        subscriber_id: subscriberId,
        billing_month: billingMonth,
        billing_year: billingYear,
        is_fully_paid: false,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "لا توجد فاتورة غير مدفوعة" }, { status: 404 });
    }

    const amount = Number(invoice.total_amount_due) - Number(invoice.amount_paid);

    await prisma.$transaction(async (tx) => {
      // Mark invoice as paid
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          is_fully_paid: true,
          amount_paid: invoice.total_amount_due,
          payment_method: "online_test",
        },
      });

      // Create OnlinePayment record
      await tx.onlinePayment.create({
        data: {
          tenant_id: subscriber.tenant_id,
          subscriber_id: subscriberId,
          invoice_id: invoice.id,
          amount,
          gateway: "test",
          gateway_ref: `TEST-${Date.now()}`,
          status: "success",
          commission_amount: Math.round(amount * 0.01),
        },
      });

      // Notification to manager
      await tx.notification.create({
        data: {
          branch_id: branch.id,
          tenant_id: subscriber.tenant_id,
          type: "online_payment",
          body: `${subscriber.name} دفع ${amount.toLocaleString("en")} د.ع إلكترونياً (اختبار)`,
          is_read: false,
          payload: {
            subscriber_id: subscriberId,
            amount,
            gateway: "test",
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      amount,
      message: "تم الدفع بنجاح (محاكاة)",
    });
  } catch (err: any) {
    console.error("Payment simulate error:", err);
    return NextResponse.json({ error: err.message || "خطأ" }, { status: 500 });
  }
}
