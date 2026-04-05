import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as any;
    if (user.role !== "owner" && user.role !== "manager") {
      return NextResponse.json({ error: "المالك فقط" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const reason = body?.reason;

    if (!reason?.trim()) {
      return NextResponse.json({ error: "السبب مطلوب" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { subscriber: { select: { id: true, name: true } } },
    });
    if (!invoice) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    if (!invoice.is_fully_paid) {
      return NextResponse.json({ error: "الفاتورة غير مدفوعة أصلاً" }, { status: 400 });
    }
    if (invoice.is_reversed) {
      return NextResponse.json({ error: "تم استرداد هذه الفاتورة مسبقاً" }, { status: 400 });
    }

    const originalPaid = Number(invoice.amount_paid);
    const originalDiscount = Number(invoice.discount_amount);
    const collectorId = invoice.collector_id;
    const reverserId = user.id ?? null;

    await prisma.$transaction(async (tx) => {
      // 1. Reset invoice + mark reversed
      await tx.invoice.update({
        where: { id },
        data: {
          is_fully_paid: false,
          amount_paid: 0,
          discount_amount: 0,
          collector_id: null,
          is_reversed: true,
          reversed_at: new Date(),
          reversed_by: reverserId,
        },
      });

      // 2. Reverse collector wallet if cash payment
      const posTx = await tx.posTransaction.findFirst({
        where: { invoice_id: id },
        orderBy: { created_at: "desc" },
      });

      if (posTx && posTx.payment_method === "cash" && posTx.staff_id) {
        await tx.collectorWallet.updateMany({
          where: { staff_id: posTx.staff_id },
          data: {
            total_collected: { decrement: originalPaid },
            balance: { decrement: originalPaid },
          },
        });
      }

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          tenant_id: invoice.tenant_id,
          branch_id: invoice.branch_id,
          actor_id: reverserId,
          actor_type: user.role,
          action: "payment_reversed",
          entity_type: "invoice",
          entity_id: id,
          old_value: {
            amount_paid: originalPaid,
            discount_amount: originalDiscount,
            is_fully_paid: true,
          },
          new_value: {
            amount_paid: 0,
            is_fully_paid: false,
            is_reversed: true,
            reason,
            subscriber: invoice.subscriber.name,
          },
        },
      });
    });

    // 5. Notify collector (outside transaction)
    if (collectorId) {
      sendPushNotification({
        staff_id: collectorId,
        title: "تم استرداد دفعة ↩️",
        body: `تم استرداد ${originalPaid.toLocaleString()} د.ع — ${invoice.subscriber.name}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      reversed: true,
      original_amount: originalPaid,
      subscriber: invoice.subscriber.name,
      message: `تم استرداد ${originalPaid.toLocaleString()} د.ع من فاتورة ${invoice.subscriber.name}`,
    });
  } catch (error: any) {
    console.error("Reverse payment error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
