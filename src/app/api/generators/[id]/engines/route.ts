import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const engines = await prisma.engine.findMany({
    where: { generator_id: id },
    orderBy: { created_at: "asc" },
  });

  const result = await Promise.all(
    engines.map(async (engine) => {
      const latestTemp = await prisma.temperatureLog.findFirst({
        where: { engine_id: engine.id },
        orderBy: { logged_at: "desc" },
      });

      const latestFuel = await prisma.fuelLog.findFirst({
        where: { engine_id: engine.id },
        orderBy: { logged_at: "desc" },
      });

      const runtimeHours = Number(engine.runtime_hours);
      const oilChangeDueIn = engine.oil_change_hours - runtimeHours;

      return {
        ...engine,
        runtime_hours: runtimeHours,
        latest_temp: latestTemp
          ? { temp_celsius: latestTemp.temp_celsius, logged_at: latestTemp.logged_at }
          : null,
        latest_fuel: latestFuel
          ? {
              fuel_level_percent: latestFuel.fuel_level_percent,
              logged_at: latestFuel.logged_at,
            }
          : null,
        oil_change_due_in_hours: oilChangeDueIn,
      };
    })
  );

  return NextResponse.json({ engines: result });
}
