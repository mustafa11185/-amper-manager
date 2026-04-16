import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const generator = await prisma.generator.findUnique({
    where: { id },
    include: {
      iot_devices: { select: { is_online: true, last_seen: true } },
      engines: { select: { id: true } },
    },
  });

  if (!generator) {
    return NextResponse.json({ error: "Generator not found" }, { status: 404 });
  }

  // Latest temperature from any engine
  const latestTemp = await prisma.temperatureLog.findFirst({
    where: { engine: { generator_id: id } },
    orderBy: { logged_at: "desc" },
  });

  // Latest fuel log
  const latestFuel = await prisma.fuelLog.findFirst({
    where: { engine: { generator_id: id } },
    orderBy: { logged_at: "desc" },
  });

  // Active manual override
  const activeOverride = await prisma.manualOverrideLog.findFirst({
    where: {
      generator_id: id,
      deactivated_at: null,
      expires_at: { gt: new Date() },
    },
  });

  const isOnline = generator.iot_devices.some((d) => d.is_online);
  const lastSeen = generator.iot_devices
    .map((d) => d.last_seen)
    .filter(Boolean)
    .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0] ?? null;

  return NextResponse.json({
    run_status: generator.run_status,
    fuel_level_pct: generator.fuel_level_pct,
    last_seen: lastSeen,
    latest_temperature: latestTemp
      ? { temp_celsius: latestTemp.temp_celsius, logged_at: latestTemp.logged_at }
      : null,
    latest_fuel: latestFuel
      ? { fuel_level_percent: latestFuel.fuel_level_percent, logged_at: latestFuel.logged_at }
      : null,
    is_online: isOnline,
    manual_override_active: !!activeOverride,
    manual_override_expires_at: activeOverride?.expires_at ?? null,
  });
}
