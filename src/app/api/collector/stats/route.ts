import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Today's transactions
    const todayTx = await prisma.posTransaction.findMany({
      where: {
        staff_id: user.id,
        created_at: { gte: todayStart },
        status: "success",
      },
      include: { subscriber: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });

    const todayCash = todayTx
      .filter((t) => t.payment_method === "cash")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // Wallet
    const wallet = await prisma.collectorWallet.findUnique({
      where: { staff_id: user.id },
    });

    // Month transactions
    const monthTx = await prisma.posTransaction.findMany({
      where: {
        staff_id: user.id,
        created_at: { gte: monthStart },
        status: "success",
      },
    });
    const monthCollected = monthTx.reduce((acc, t) => acc + Number(t.amount), 0);

    // Visited today (unique subscribers)
    const visitedToday = new Set(todayTx.map((t) => t.subscriber_id)).size;

    // Expenses this month
    const expenses = await prisma.expense.findMany({
      where: {
        staff_id: user.id,
        created_at: { gte: monthStart },
      },
      orderBy: { created_at: "desc" },
    });

    // Recent payments
    const recentPayments = todayTx.slice(0, 5).map((t) => ({
      subscriber_name: (t as any).subscriber?.name ?? "—",
      amount: Number(t.amount),
      created_at: t.created_at.toISOString(),
    }));

    // Attendance summary this month
    const monthShifts = await prisma.collectorShift.findMany({
      where: { staff_id: user.id, shift_date: { gte: monthStart } },
    });
    const attendedDays = monthShifts.filter((s) => s.check_in_at).length;
    const lateShifts = monthShifts.filter((s) => s.late_minutes > 0);
    const avgLate = lateShifts.length > 0
      ? Math.round(lateShifts.reduce((a, s) => a + s.late_minutes, 0) / lateShifts.length)
      : 0;
    const maxLateShift = lateShifts.sort((a, b) => b.late_minutes - a.late_minutes)[0];

    return NextResponse.json({
      today_cash: todayCash,
      today_total: todayCash,
      today_count: todayTx.length,
      month_collected: monthCollected,
      month_delivered: wallet ? Number(wallet.total_delivered) : 0,
      wallet_balance: wallet ? Number(wallet.balance) : 0,
      daily_target: user.dailyTarget ?? 0,
      visited_today: visitedToday,
      recent_payments: recentPayments,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        description: e.description,
        created_at: e.created_at.toISOString(),
      })),
      attendance: {
        attended_days: attendedDays,
        late_count: lateShifts.length,
        avg_late_minutes: avgLate,
        max_late_minutes: maxLateShift?.late_minutes ?? 0,
        max_late_date: maxLateShift?.shift_date?.toISOString() ?? null,
        total_late_minutes: lateShifts.reduce((a, s) => a + s.late_minutes, 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
