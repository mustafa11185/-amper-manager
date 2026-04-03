import { NextResponse } from "next/server";
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions); if (!session?.user) throw new Error("Unauthorized"); const user = session.user as any;

    const wallet = await prisma.collectorWallet.findUnique({
      where: { staff_id: user.id },
    });

    // Get delivery records (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const deliveries = await prisma.deliveryRecord.findMany({
      where: {
        from_staff_id: user.id,
        delivered_at: { gte: threeMonthsAgo },
      },
      orderBy: { delivered_at: "desc" },
      take: 50,
    });

    // Get today's POS transactions for this staff
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const todayTx = await prisma.posTransaction.findMany({
      where: { staff_id: user.id, created_at: { gte: todayStart }, status: "success" },
    });

    const monthTx = await prisma.posTransaction.findMany({
      where: { staff_id: user.id, created_at: { gte: monthStart }, status: "success" },
    });

    const todayTotal = todayTx.reduce((a, t) => a + Number(t.amount), 0);
    const monthTotal = monthTx.reduce((a, t) => a + Number(t.amount), 0);

    return NextResponse.json({
      balance: wallet ? Number(wallet.balance) : 0,
      total_collected: wallet ? Number(wallet.total_collected) : 0,
      total_delivered: wallet ? Number(wallet.total_delivered) : 0,
      today_collected: todayTotal,
      month_collected: monthTotal,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        amount: Number(d.amount),
        delivered_at: d.delivered_at.toISOString(),
        received_by_owner: d.received_by_owner,
        type: d.received_by_owner ? "delivery" : "collection",
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
