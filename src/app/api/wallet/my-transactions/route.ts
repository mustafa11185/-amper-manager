import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions); if (!session?.user) throw new Error("Unauthorized"); const user = session.user as any;
    const period = req.nextUrl.searchParams.get("period") ?? "today";

    let since: Date;
    if (period === "week") {
      since = new Date(); since.setDate(since.getDate() - 7); since.setHours(0,0,0,0);
    } else if (period === "month") {
      since = new Date(); since.setDate(1); since.setHours(0,0,0,0);
    } else {
      since = new Date(); since.setHours(0,0,0,0);
    }

    // Wallet balance
    const wallet = await prisma.collectorWallet.findUnique({ where: { staff_id: user.id } });

    // Deliveries to owner
    const deliveries = await prisma.deliveryRecord.findMany({
      where: { from_staff_id: user.id, delivered_at: { gte: since } },
      orderBy: { delivered_at: "desc" },
    });

    // POS transactions (collections)
    const collections = await prisma.posTransaction.findMany({
      where: { staff_id: user.id, created_at: { gte: since }, status: "success" },
      include: { subscriber: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });

    // Merge and sort
    const transactions = [
      ...collections.map((c: any) => ({
        id: c.id,
        type: "collection" as const,
        amount: Number(c.amount),
        date: c.created_at.toISOString(),
        label: c.subscriber?.name ?? "مشترك",
        method: c.payment_method,
      })),
      ...deliveries.map(d => ({
        id: d.id,
        type: "delivery" as const,
        amount: Number(d.amount),
        date: d.delivered_at.toISOString(),
        label: "تسليم للمدير",
        method: null,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Today stats
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayCount = collections.filter(c => new Date(c.created_at) >= todayStart).length;

    return NextResponse.json({
      balance: wallet ? Number(wallet.balance) : 0,
      total_delivered: wallet ? Number(wallet.total_delivered) : 0,
      today_count: todayCount,
      transactions,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
