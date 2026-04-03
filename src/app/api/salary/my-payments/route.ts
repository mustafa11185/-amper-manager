import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions); if (!session?.user) throw new Error("Unauthorized"); const user = session.user as any;
    const url = req.nextUrl.searchParams;
    const month = parseInt(url.get("month") || `${new Date().getMonth() + 1}`);
    const year = parseInt(url.get("year") || `${new Date().getFullYear()}`);

    const payments = await prisma.salaryPayment.findMany({
      where: { staff_id: user.id, month, year },
      orderBy: { paid_at: "desc" },
    });

    // Get payer names for deliveries
    const deliveryIds = payments
      .filter((p) => p.delivery_id)
      .map((p) => p.delivery_id!);

    const deliveries =
      deliveryIds.length > 0
        ? await prisma.deliveryRecord.findMany({
            where: { id: { in: deliveryIds } },
            select: {
              id: true,
              to_staff_id: true,
            },
          })
        : [];

    const toStaffIds = deliveries
      .map((d) => d.to_staff_id)
      .filter(Boolean) as string[];
    const staffNames =
      toStaffIds.length > 0
        ? await prisma.staff.findMany({
            where: { id: { in: toStaffIds } },
            select: { id: true, name: true },
          })
        : [];

    const staffMap = new Map(staffNames.map((s) => [s.id, s.name]));
    const deliveryToStaff = new Map(
      deliveries.map((d) => [d.id, d.to_staff_id])
    );

    const result = payments.map((p) => {
      let paidByName = "المدير";
      if (p.delivery_id) {
        const toId = deliveryToStaff.get(p.delivery_id);
        if (toId) paidByName = staffMap.get(toId) || "المدير";
      }

      return {
        id: p.id,
        amount: Number(p.amount),
        payment_type: p.payment_type || "salary",
        notes: p.notes,
        tip_notes: p.tip_notes,
        paid_at: p.paid_at.toISOString(),
        paid_by_name: paidByName,
        paid_from_delivery: p.paid_from_delivery,
      };
    });

    return NextResponse.json({ payments: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
