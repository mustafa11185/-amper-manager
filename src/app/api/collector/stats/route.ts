import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Baghdad day window (UTC+3, no DST). */
function getIraqDayWindow() {
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET_MS);
  const dayStart = new Date(
    Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) -
      IRAQ_OFFSET_MS,
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { dayStart, dayEnd };
}

/** Baghdad month window — start of the current calendar month in Iraq time. */
function getIraqMonthStart() {
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET_MS);
  return new Date(
    Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), 1) - IRAQ_OFFSET_MS,
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const { dayStart, dayEnd } = getIraqDayWindow();
    const monthStart = getIraqMonthStart();

    // Today's collections — read from Invoice where this collector received payment.
    // (PosTransaction is a legacy table that the staff_flutter payment flow
    // doesn't populate; only Invoice.collector_id is stamped.)
    const todayInvoices = await prisma.invoice.findMany({
      where: {
        collector_id: user.id,
        updated_at: { gte: dayStart, lte: dayEnd },
        amount_paid: { gt: 0 },
      },
      include: { subscriber: { select: { name: true } } },
      orderBy: { updated_at: "desc" },
    });

    const todayTotal = todayInvoices.reduce((acc, i) => acc + Number(i.amount_paid), 0);
    const todayCash = todayInvoices
      .filter((i) => (i.payment_method ?? "cash").toLowerCase() === "cash")
      .reduce((acc, i) => acc + Number(i.amount_paid), 0);

    // Wallet (unchanged — reads from CollectorWallet summary table)
    const wallet = await prisma.collectorWallet.findUnique({
      where: { staff_id: user.id },
    });

    // Month collections
    const monthInvoices = await prisma.invoice.findMany({
      where: {
        collector_id: user.id,
        updated_at: { gte: monthStart },
        amount_paid: { gt: 0 },
      },
      select: { amount_paid: true },
    });
    const monthCollected = monthInvoices.reduce((acc, i) => acc + Number(i.amount_paid), 0);

    // Unique subscribers visited today
    const visitedToday = new Set(todayInvoices.map((i) => i.subscriber_id)).size;

    // Expenses this month (unchanged)
    const expenses = await prisma.expense.findMany({
      where: {
        staff_id: user.id,
        created_at: { gte: monthStart },
      },
      orderBy: { created_at: "desc" },
    });

    const recentPayments = todayInvoices.slice(0, 5).map((i) => ({
      subscriber_name: (i as any).subscriber?.name ?? "—",
      amount: Number(i.amount_paid),
      created_at: i.updated_at.toISOString(),
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
      today_total: todayTotal,
      today_count: todayInvoices.length,
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
