import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (!auth || auth.type !== "raspberry") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generator = auth.device.generator;
  const branch = generator.branch;

  // Latest temperature
  const latestTemp = await prisma.temperatureLog.findFirst({
    where: { engine: { generator_id: generator.id } },
    orderBy: { logged_at: "desc" },
  });

  // Gold/normal hours today from NormalCutLog
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const cutLogs = await prisma.normalCutLog.findMany({
    where: {
      branch_id: branch.id,
      cut_start: { gte: todayStart },
    },
  });

  // Total normal cut minutes today
  const normalCutMin = cutLogs.reduce(
    (acc, log) => acc + (log.duration_min ?? 0),
    0
  );
  // Assume 24h day, normal hours = cut time, gold = rest of elapsed time
  const elapsedHours =
    (Date.now() - todayStart.getTime()) / (1000 * 60 * 60);
  const normalHoursToday = normalCutMin / 60;
  const goldHoursToday = Math.max(0, elapsedHours - normalHoursToday);

  // Subscriber counts
  const activeSubscribers = await prisma.subscriber.count({
    where: { generator_id: generator.id, is_active: true },
  });

  const now = new Date();
  const unpaidCount = await prisma.invoice.count({
    where: {
      branch_id: branch.id,
      billing_month: now.getMonth() + 1,
      billing_year: now.getFullYear(),
      is_fully_paid: false,
    },
  });

  return NextResponse.json({
    generator_name: generator.name,
    branch_name: branch.name,
    run_status: generator.run_status,
    fuel_level_pct: generator.fuel_level_pct,
    latest_temp: latestTemp?.temp_celsius ?? null,
    gold_hours_today: Math.round(goldHoursToday * 100) / 100,
    normal_hours_today: Math.round(normalHoursToday * 100) / 100,
    active_subscribers_count: activeSubscribers,
    unpaid_count: unpaidCount,
    current_time: new Date().toISOString(),
  });
}
