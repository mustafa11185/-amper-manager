import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    if (!invoice.is_fully_paid) {
      return NextResponse.json({ error: "الفاتورة غير مدفوعة أصلاً" }, { status: 400 });
    }

    const originalPaid = Number(invoice.amount_paid);

    await prisma.$transaction(async (tx) => {
      // 1. Reset invoice
      await tx.invoice.update({
        where: { id },
        data: {
          is_fully_paid: false,
          amount_paid: 0,
          discount_amount: 0,
          collector_id: null,
        },
      });

      // 2. Find the POS transaction for this invoice and reverse wallet
      try {
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
      } catch {
        // Wallet update failed — continue anyway (invoice is already reversed)
        console.error("Wallet reversal failed, continuing...");
      }

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          tenant_id: invoice.tenant_id,
          branch_id: invoice.branch_id,
          actor_id: user.id ?? null,
          actor_type: user.role,
          action: "payment_reversed",
          entity_type: "invoice",
          entity_id: id,
          old_value: { amount_paid: originalPaid, is_fully_paid: true },
          new_value: { amount_paid: 0, is_fully_paid: false, reason },
        },
      });
    });

    return NextResponse.json({ ok: true, message: "تم إلغاء الدفع" });
  } catch (error) {
    console.error("Reverse payment error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
