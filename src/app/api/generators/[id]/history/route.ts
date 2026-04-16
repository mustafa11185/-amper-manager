import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type") ?? "temperature";
  const hours = parseInt(searchParams.get("hours") ?? "24", 10);

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get all engine IDs for this generator
  const engines = await prisma.engine.findMany({
    where: { generator_id: id },
    select: { id: true },
  });
  const engineIds = engines.map((e) => e.id);

  if (engineIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  if (type === "temperature") {
    const logs = await prisma.temperatureLog.findMany({
      where: {
        engine_id: { in: engineIds },
        logged_at: { gte: since },
      },
      orderBy: { logged_at: "asc" },
      select: { temp_celsius: true, logged_at: true },
    });
    return NextResponse.json({
      data: logs.map((l) => ({ value: l.temp_celsius, logged_at: l.logged_at })),
    });
  }

  if (type === "fuel") {
    const logs = await prisma.fuelLog.findMany({
      where: {
        engine_id: { in: engineIds },
        logged_at: { gte: since },
      },
      orderBy: { logged_at: "asc" },
      select: { fuel_level_percent: true, logged_at: true },
    });
    return NextResponse.json({
      data: logs.map((l) => ({ value: l.fuel_level_percent, logged_at: l.logged_at })),
    });
  }

  return NextResponse.json({ error: "Invalid type. Use temperature or fuel" }, { status: 400 });
}
