import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { subscriber_serial, amount, payment_method, pay_type } = body;

  if (!subscriber_serial || !amount || amount <= 0) {
    return NextResponse.json(
      { error: "subscriber_serial and positive amount are required" },
      { status: 400 }
    );
  }

  const method = payment_method ?? "cash";
  const type = pay_type ?? "invoice";

  // Find subscriber
  const subscriber = await prisma.subscriber.findFirst({
    where: { serial_number: subscriber_serial, is_active: true },
  });

  if (!subscriber) {
    return NextResponse.json(
      { error: "Subscriber not found" },
      { status: 404 }
    );
  }

  let remainingAmount = amount;
  const appliedTo: Array<{ invoice_id?: string; type: string; amount: number }> = [];

  if (type === "invoice" || type === "all") {
    // Pay current month invoice first
    const now = new Date();
    const invoice = await prisma.invoice.findFirst({
      where: {
        subscriber_id: subscriber.id,
        billing_month: now.getMonth() + 1,
        billing_year: now.getFullYear(),
        is_fully_paid: false,
      },
    });

    if (invoice && remainingAmount > 0) {
      const due = Number(invoice.total_amount_due) - Number(invoice.amount_paid);
      const payAmount = Math.min(remainingAmount, due);
      const newPaid = Number(invoice.amount_paid) + payAmount;
      const fullyPaid = newPaid >= Number(invoice.total_amount_due);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amount_paid: newPaid,
          is_fully_paid: fullyPaid,
          payment_method: method,
        },
      });

      remainingAmount -= payAmount;
      appliedTo.push({
        invoice_id: invoice.id,
        type: "invoice",
        amount: payAmount,
      });
    }
  }

  if ((type === "debt" || type === "all") && remainingAmount > 0) {
    // Apply remaining to debt
    const currentDebt = Number(subscriber.total_debt);
    const debtPayment = Math.min(remainingAmount, currentDebt);

    if (debtPayment > 0) {
      await prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { total_debt: currentDebt - debtPayment },
      });

      remainingAmount -= debtPayment;
      appliedTo.push({ type: "debt", amount: debtPayment });
    }
  }

  return NextResponse.json({
    ok: true,
    receipt: {
      subscriber_name: subscriber.name,
      subscriber_serial: subscriber.serial_number,
      total_paid: amount - remainingAmount,
      payment_method: method,
      applied_to: appliedTo,
      change: remainingAmount,
      timestamp: new Date().toISOString(),
    },
  });
}
