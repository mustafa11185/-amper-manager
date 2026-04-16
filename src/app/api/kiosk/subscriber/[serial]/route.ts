import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const { serial } = await params;

  // Find subscriber by serial number
  const subscriber = await prisma.subscriber.findFirst({
    where: { serial_number: serial, is_active: true },
  });

  if (!subscriber) {
    return NextResponse.json(
      { error: "Subscriber not found" },
      { status: 404 }
    );
  }

  // Get current month's invoice
  const now = new Date();
  const currentInvoice = await prisma.invoice.findFirst({
    where: {
      subscriber_id: subscriber.id,
      billing_month: now.getMonth() + 1,
      billing_year: now.getFullYear(),
    },
  });

  return NextResponse.json({
    name: subscriber.name,
    serial_number: subscriber.serial_number,
    subscription_type: subscriber.subscription_type,
    amperage: Number(subscriber.amperage),
    total_debt: Number(subscriber.total_debt),
    current_invoice: currentInvoice
      ? {
          id: currentInvoice.id,
          total_amount_due: Number(currentInvoice.total_amount_due),
          amount_paid: Number(currentInvoice.amount_paid),
          billing_month: currentInvoice.billing_month,
          billing_year: currentInvoice.billing_year,
          is_fully_paid: currentInvoice.is_fully_paid,
        }
      : null,
  });
}
