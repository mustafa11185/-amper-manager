import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma";
import { getCurrentCycleWindow } from "@/lib/billing-cycle";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions); if (!session?.user) throw new Error("Unauthorized"); const user = session.user as any;
    const url = req.nextUrl.searchParams;
    const explicitMonth = url.get("month");
    const explicitYear = url.get("year");

    // Salary is per-CYCLE. Use current cycle window unless caller
    // passes an explicit month/year (historical lookup).
    let month: number;
    let year: number;
    let cycleStart: Date;
    let cycleEnd: Date;
    if (explicitMonth && explicitYear) {
      month = parseInt(explicitMonth);
      year = parseInt(explicitYear);
      cycleStart = new Date(year, month - 1, 1);
      cycleEnd = new Date(year, month, 1);
    } else if (user.branchId) {
      const cycle = await getCurrentCycleWindow(user.branchId);
      month = cycle.month;
      year = cycle.year;
      cycleStart = cycle.start;
      cycleEnd = new Date();
    } else {
      const now = new Date();
      month = now.getMonth() + 1;
      year = now.getFullYear();
      cycleStart = new Date(year, month - 1, 1);
      cycleEnd = new Date(year, month, 1);
    }

    // 1. Get salary config
    const config = await prisma.staffSalaryConfig.findUnique({
      where: { staff_id: user.id },
    });
    const salaryAgreed = config ? Number(config.monthly_amount) : 0;

    // 2. Get all salary payments this month
    const payments = await prisma.salaryPayment.findMany({
      where: { staff_id: user.id, month, year },
    });

    let salaryPaid = 0;
    let tipsTotal = 0;
    for (const p of payments) {
      const amt = Number(p.amount);
      if (p.payment_type === "tip") {
        tipsTotal += amt;
      } else {
        salaryPaid += amt;
      }
    }

    const totalReceived = salaryPaid + tipsTotal;
    const salaryRemaining = Math.max(0, salaryAgreed - salaryPaid);

    let status: "paid" | "partial" | "pending" = "pending";
    if (salaryPaid >= salaryAgreed && salaryAgreed > 0) status = "paid";
    else if (salaryPaid > 0) status = "partial";

    // 3. Get total collected (POS transactions) this cycle
    const collections = await prisma.posTransaction.aggregate({
      where: {
        staff_id: user.id,
        status: "success",
        created_at: { gte: cycleStart, lt: cycleEnd },
      },
      _sum: { amount: true },
      _count: true,
    });

    // 4. Cash vs card breakdown
    const cashCollections = await prisma.posTransaction.aggregate({
      where: {
        staff_id: user.id,
        status: "success",
        payment_method: "cash",
        created_at: { gte: cycleStart, lt: cycleEnd },
      },
      _sum: { amount: true },
    });

    const totalCollected = Number(collections._sum.amount || 0);
    const cashTotal = Number(cashCollections._sum.amount || 0);
    const cardTotal = totalCollected - cashTotal;

    return NextResponse.json({
      salary_agreed: salaryAgreed,
      salary_paid: salaryPaid,
      tips_total: tipsTotal,
      total_received: totalReceived,
      salary_remaining: salaryRemaining,
      status,
      total_collected: totalCollected,
      collection_count: collections._count,
      cash_collected: cashTotal,
      card_collected: cardTotal,
      month,
      year,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
